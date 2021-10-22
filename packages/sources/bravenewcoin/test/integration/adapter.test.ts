import { AdapterRequest } from '@chainlink/types'
import { util } from '@chainlink/ea-bootstrap'
import http from 'http'
import nock from 'nock'
import request from 'supertest'
import { server as startServer } from '../../src'
import { mockCryptoEndpointSuccess } from './cryptoFixtures'
import { mockVwapEndpointSuccess } from './vwapFixtures'

describe('bravenewcoin', () => {
  let server: http.Server
  const oldEnv: NodeJS.ProcessEnv = JSON.parse(JSON.stringify(process.env))
  const req = request('localhost:8080')

  beforeAll(async () => {
    server = await startServer()
    process.env.CACHE_ENABLED = 'false'

    process.env.API_KEY = process.env.API_KEY || 'mock-api-key'
    process.env.CLIENT_ID = process.env.CLIENT_ID || 'mock-client-id'

    if (util.parseBool(process.env.RECORD)) {
      nock.recorder.rec()
    }
  })

  afterAll((done) => {
    process.env = oldEnv

    if (util.parseBool(process.env.RECORD)) {
      nock.recorder.play()
    }

    nock.restore()
    nock.cleanAll()
    nock.enableNetConnect()
    server.close(done)
  })

  describe('when making a request to bravenewcoin to crypto endpoint', () => {
    const cryptoRequest: AdapterRequest = {
      id: '1',
      data: {
        endpoint: 'crypto',
        base: 'ETH',
        quote: 'BTC',
      },
    }

    describe('when sending well-formed request', () => {
      it('should reply with success', async () => {
        mockCryptoEndpointSuccess()
        const response = await req
          .post('/')
          .send(cryptoRequest)
          .set('Accept', '*/*')
          .set('Content-Type', 'application/json')
          .expect('Content-Type', /json/)
          .expect(200)
        expect(response.body).toMatchSnapshot()
      })
    })
  })

  describe('when making a request to bravenewcoin to vwap endpoint', () => {
    const vwapRequest: AdapterRequest = {
      id: '2',
      data: {
        endpoint: 'vwap',
        base: 'ETH',
      },
    }

    describe('when sending well-formed request', () => {
      it('should reply with success', async () => {
        mockVwapEndpointSuccess()
        const response = await req
          .post('/')
          .send(vwapRequest)
          .set('Accept', '*/*')
          .set('Content-Type', 'application/json')
          .expect('Content-Type', /json/)
          .expect(200)
        expect(response.body).toMatchSnapshot()
      })
    })
  })
})
