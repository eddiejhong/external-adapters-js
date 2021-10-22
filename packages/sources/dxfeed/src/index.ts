import { expose } from '@chainlink/ea-bootstrap'
import { endpointSelector, makeExecute, makeWSHandler } from './adapter'
import { makeConfig, NAME } from './config'

export = {
  NAME,
  makeExecute,
  makeWSHandler,
  makeConfig,
  endpointSelector,
  ...expose(NAME, makeExecute(), makeWSHandler(), endpointSelector),
}
