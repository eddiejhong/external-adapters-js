import { AdapterRequest } from '@chainlink/types'
import { omit } from 'lodash'
import { AnyAction } from 'redux'
import { combineEpics, createEpicMiddleware, Epic } from 'redux-observable'
import { from, merge, of, partition, race, timer } from 'rxjs'
import {
  catchError,
  delay,
  filter,
  map,
  mapTo,
  mergeMap,
  take,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators'
import { RootState } from '../..'
import {
  warmupExecute,
  warmupFailed,
  warmupFulfilled,
  warmupJoinGroup,
  warmupLeaveGroup,
  warmupRequested,
  warmupStopped,
  warmupSubscribed,
  warmupSubscriptionTimeoutReset,
  warmupUnsubscribed,
} from './actions'
import { Config, get, WARMUP_REQUEST_ID } from './config'
import { getSubscriptionKey } from './util'

export interface EpicDependencies {
  config: Config
}

export const executeHandler: Epic<AnyAction, AnyAction, RootState, EpicDependencies> = (
  action$,
  state$,
) => {
  const warmupExecute$ = action$.pipe(filter(warmupExecute.match))
  const [batchExecute$, execute$] = partition(
    warmupExecute$,
    (val) => !!val.payload.result?.debug?.batchablePropertyPath,
  )

  const subscribeBatch$ = batchExecute$.pipe(
    withLatestFrom(state$),
    mergeMap(([{ payload }, state]) => {
      const actionsToDispatch: AnyAction[] = []

      const existingBatchWarmer = Object.entries(state.cacheWarmer.subscriptions).find(
        ([, subscriptionState]) => {
          const isBatchWarmerSubscription = subscriptionState.childLastSeenById
          const isMatchingSubscription =
            subscriptionState.executeFn.toString() === payload.executeFn.toString()
          return isBatchWarmerSubscription && isMatchingSubscription
        },
      )

      // If there is no existing batch warmer,
      // A new key is created by omitting the data field
      // We want the key to be consistent. Otherwise it would change on every new child
      const batchWarmerSubscriptionKey =
        existingBatchWarmer?.[0] ?? getSubscriptionKey(omit(payload, ['data']))
      const batchablePropertyPath = payload.result?.debug?.batchablePropertyPath

      // Start placeholder subscriptions for children
      const childLastSeenById: { [childKey: string]: number } = {}
      // If result was from a batch request
      if (payload.result?.data?.results) {
        for (const [request] of Object.values<[AdapterRequest, number]>(
          payload.result.data.results,
        )) {
          const warmupSubscribedPayloadChild = {
            ...payload,
            data: request,
            parent: batchWarmerSubscriptionKey,
            batchablePropertyPath,
          }
          const childKey = getSubscriptionKey(warmupSubscribedPayloadChild)
          childLastSeenById[childKey] = Date.now()
          actionsToDispatch.push(warmupSubscribed(warmupSubscribedPayloadChild))
        }
      } else {
        const warmupSubscribedPayloadChild = {
          ...payload,
          parent: batchWarmerSubscriptionKey,
          batchablePropertyPath,
        }
        const childKey = getSubscriptionKey(warmupSubscribedPayloadChild)
        childLastSeenById[childKey] = Date.now()
        actionsToDispatch.push(warmupSubscribed(warmupSubscribedPayloadChild))
      }

      // If batch warmer already exists join it by adding childLastSeenById to request data
      if (existingBatchWarmer && batchablePropertyPath) {
        actionsToDispatch.push(
          warmupJoinGroup({
            parent: batchWarmerSubscriptionKey,
            childLastSeenById: childLastSeenById,
            batchablePropertyPath,
          }),
        )
      }
      // If batch warmer does not exist, start it
      else {
        const warmupSubscribedAction =
          batchablePropertyPath && !Array.isArray(payload.data[batchablePropertyPath])
            ? // If incoming request isn't an array, transform into one
              // So the request is used as a batch request
              warmupSubscribed({
                ...payload,
                data: {
                  ...payload.data,
                  [batchablePropertyPath]: [payload.data[batchablePropertyPath]],
                },
                key: batchWarmerSubscriptionKey,
                childLastSeenById,
              })
            : warmupSubscribed({ ...payload, key: batchWarmerSubscriptionKey, childLastSeenById })
        actionsToDispatch.push(warmupSubscribedAction)
      }

      return from(actionsToDispatch)
    }),
  )

  const subscribeIndividual$ = execute$.pipe(map(({ payload }) => warmupSubscribed(payload)))

  return merge(subscribeBatch$, subscribeIndividual$)
}

export const warmupSubscriber: Epic<AnyAction, AnyAction, any, EpicDependencies> = (
  action$,
  state$,
  { config },
) =>
  action$.pipe(
    filter(warmupSubscribed.match),
    map(({ payload }) => ({
      payload,
      key: payload.key || getSubscriptionKey(payload),
    })),
    withLatestFrom(state$),
    // check if the subscription already exists, then noop
    filter(([{ payload, key }, state]) => {
      // if a child, register, but don't warm
      if (payload.parent) return false
      // if subscription does not exist, then continue
      // this check doesnt work because state is already set!
      return !state.cacheWarmer.subscriptions[key]?.isDuplicate
    }),
    // on a subscribe action being dispatched, spin up a long lived interval if one doesnt exist yet
    mergeMap(([{ payload, key }]) =>
      timer(
        0,
        // If TTL is set from the rate limiter
        payload?.result?.maxAge ||
          // Otherwise use MIN_TTL
          config.warmupInterval,
      ).pipe(
        mapTo(warmupRequested({ key })),
        // unsubscribe our warmup algo when a matching unsubscribe comes in
        takeUntil(
          action$.pipe(
            filter(warmupUnsubscribed.match || warmupStopped.match),
            filter((a) => a.payload.key === key),
          ),
        ),
      ),
    ),
  )

/**
 * Handle warmup response request events
 */
export const warmupRequestHandler: Epic<AnyAction, AnyAction, any> = (action$, state$) =>
  action$.pipe(
    // this pipeline will execute when we have a request to warm up an adapter
    filter(warmupRequested.match),
    // fetch our required state to make a request to warm up an adapter
    withLatestFrom(state$),
    map(([action, state]) => ({
      requestData: state.cacheWarmer.subscriptions[action.payload.key],
      key: action.payload.key,
    })),
    // make the request
    mergeMap(({ requestData, key }) =>
      from(
        requestData.executeFn({
          id: WARMUP_REQUEST_ID,
          data: { ...requestData.origin, maxAge: -1 },
        }),
      ).pipe(
        mapTo(warmupFulfilled({ key })),
        catchError((error: unknown) => of(warmupFailed({ error: error as Error, key }))),
      ),
    ),
  )

// we can combine this into one of the above epics if we have performance issues later on
export const warmupUnsubscriber: Epic<AnyAction, AnyAction, any, EpicDependencies> = (
  action$,
  state$,
  { config },
) => {
  const unsubscribeOnFailure$ = action$.pipe(
    filter(warmupFailed.match),
    withLatestFrom(state$),
    filter(
      ([{ payload }, state]) =>
        state.cacheWarmer.warmups[payload.key]?.errorCount ?? 0 >= config.unhealthyThreshold,
    ),
    map(([{ payload }]) => warmupUnsubscribed({ key: payload.key })),
  )

  // emits whenever a subscription event comes in,
  // used as a helper stream for the timeout limit stream
  const keyedSubscription$ = action$.pipe(
    filter(warmupSubscribed.match),
    map(({ payload }) => ({ payload, key: getSubscriptionKey(payload) })),
  )

  const unsubscribeOnTimeout$ = keyedSubscription$.pipe(
    // when a subscription comes in
    mergeMap(({ key }) => {
      // we look for matching subscriptions of the same type
      // which deactivates the current timer
      const reset$ = keyedSubscription$.pipe(
        filter(({ key: keyB }) => key === keyB),
        take(1),
        mapTo(warmupSubscriptionTimeoutReset({ key })),
      )

      // start the current unsubscription timer
      const timeout$ = of(warmupUnsubscribed({ key })).pipe(delay(config.subscriptionTTL))

      // if a re-subscription comes in before timeout emits, then we emit nothing
      // else we unsubscribe from the current subscription
      return race(reset$, timeout$)
    }),
  )

  const stopOnBatch$ = keyedSubscription$.pipe(
    // when a subscription comes in, if it has children
    filter(({ payload }) => !!payload?.childLastSeenById),
    mergeMap(({ payload }) =>
      Object.keys(payload?.childLastSeenById || {}).map((childKey) =>
        warmupStopped({ key: childKey }),
      ),
    ),
  )

  const unsubscribeOnBatchEmpty$ = action$.pipe(
    filter(warmupLeaveGroup.match),
    withLatestFrom(state$),
    filter(
      ([{ payload }, state]) =>
        state.cacheWarmer.subscriptions[payload.parent].origin[payload.batchablePropertyPath]
          .length > 0,
    ),
    map(([{ payload }]) => warmupUnsubscribed({ key: payload.parent })),
  )

  return merge(unsubscribeOnFailure$, unsubscribeOnTimeout$, stopOnBatch$, unsubscribeOnBatchEmpty$)
}

export const rootEpic = combineEpics(
  executeHandler,
  warmupSubscriber,
  warmupUnsubscriber,
  warmupRequestHandler,
)

export const epicMiddleware = createEpicMiddleware<any, any, any, EpicDependencies>({
  dependencies: { config: get() },
})
