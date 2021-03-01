import { Requester, Validator } from '@chainlink/external-adapter'
import { ExecuteWithConfig, Config } from '@chainlink/types'

export const NAME = 'price'
export enum Paths {
  Price = 'price',
  MarketCap = 'marketcap',
}

// Coin IDs fetched from the ID map: https://coinmarketcap.com/api/documentation/v1/#operation/getV1CryptocurrencyMap
const presetIds: { [symbol: string]: number } = {
  COMP: 5692,
  BNT: 1727,
  RCN: 2096,
  UNI: 7083,
  CRV: 6538,
  FNX: 5712,
  ETC: 1321,
  BAT: 1697,
  CRO: 3635,
  LEO: 3957,
  FTT: 4195,
  HT: 2502,
  OKB: 3897,
  KCS: 2087,
  BTC: 1,
  ETH: 1027,
  BNB: 1839,
  LINK: 1975,
  BCH: 1831,
  MKR: 1518,
  AAVE: 7278,
  UMA: 5617,
  SNX: 2586,
  REN: 2539,
  KNC: 1982,
  SUSHI: 6758,
  YFI: 5864,
  BAL: 5728,
  '1INCH': 8104,
}

// Defaults we use when there are multiple currencies with the same symbol
const presetSlugs: Record<string, string> = {
  COMP: 'compound',
  BNT: 'bancor',
  RCN: 'ripio-credit-network',
  UNI: 'uniswap',
  CRV: 'curve-dao-token',
  FNX: 'finnexus',
  ETC: 'ethereum-classic',
  BAT: 'basic-attention-token',
  CRO: 'crypto-com-coin',
  LEO: 'unus-sed-leo',
  FTT: 'ftx-token',
  HT: 'huobi-token',
  OKB: 'okb',
  KCS: 'kucoin-token',
}

const priceParams = {
  symbol: ['base', 'from', 'coin', 'sym', 'symbol'],
  convert: ['quote', 'to', 'market', 'convert'],
  cid: false,
  slug: false,
  path: false,
}

export const execute: ExecuteWithConfig<Config> = async (request, config) => {
  const url = 'cryptocurrency/quotes/latest'
  const validator = new Validator(request, priceParams)
  if (validator.error) throw validator.error

  const jobRunID = validator.validated.id

  const symbol = validator.validated.data.symbol
  // CMC allows a coin name to be specified instead of a symbol
  const slug = validator.validated.data.slug
  // CMC allows a coin ID to be specified instead of a symbol
  const cid = validator.validated.data.cid || ''
  // Free CMCPro API only supports a single symbol to convert
  const convert = validator.validated.data.convert
  const path = validator.validated.data.path || Paths.Price

  const params: Record<string, string> = { convert }
  if (cid) {
    params.id = cid
  } else if (slug) {
    params.slug = slug
  } else {
    const slugForSymbol = presetSlugs[symbol]
    if (slugForSymbol) {
      params.slug = slugForSymbol
    } else {
      params.symbol = symbol
    }
  }

  const options = {
    ...config.api,
    url,
    params,
  }
  const response = await Requester.request(options)

  // CMC API currently uses ID as key in response, when querying with "slug" param
  const _keyForSlug = (data: any, slug: string) => {
    if (!data || !data.data) return
    // First try to find slug key in response (in case the API starts returning keys correctly)
    if (Object.keys(data.data).includes(slug)) return slug
    // Fallback to ID
    const _iEqual = (s1: string, s2: string) => s1.toUpperCase() === s2.toUpperCase()
    const o: any = Object.values(data.data).find((o: any) => _iEqual(o.slug, slug))
    return o && o.id
  }

  const key = params.id || _keyForSlug(response.data, params.slug || '') || params.symbol
  const resultPaths: { [key: string]: string[] } = {
    [Paths.Price]: ['data', key, 'quote', convert, 'price'],
    [Paths.MarketCap]: ['data', key, 'quote', convert, 'market_cap'],
  }

  const result = Requester.validateResultNumber(response.data, resultPaths[path])

  return Requester.success(jobRunID, {
    data: config.verbose ? { ...response.data, result } : { result },
    result,
    status: 200,
  })
}
