# Chainlink External Adapter for SuperMarioCoin

This adapter fetches data related to existing SuperMarioCoin addresses.

### Environment Variables

| Required? |  Name   |                                                                                                Description                                                                                                 | Options | Defaults to |
| :-------: | :-----: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----: | :---------: |
|           | API_KEY | **Currently, this external adapter uses mock data from a hardcoded endpoint.** An API key that can be obtained from the data provider's dashboard (add a ✅ in `Required?` if this parameter is required). |         |             |

---

### Input Parameters

| Required? |   Name   |     Description     |                         Options                         | Defaults to |
| :-------: | :------: | :-----------------: | :-----------------------------------------------------: | :---------: |
|           | endpoint | The endpoint to use | [total](#Total-Endpoint), [highlow](#High-Low-Endpoint) |    total    |

---

## Total Endpoint

The Total Endpoint returns the sum of all SuperMarioCoin account balances. This endpoint accepts no inputs.

### Sample Input

```json
{
  "id": "1",
  "data": {
    "endpoint": "total"
  }
}
```

### Sample Output

```json
{
    "jobRunID": "1",
    "result": {
        "total": 462122230678539
    },
    "statusCode": 200,
    "data": [...]
}
```

## High Low Endpoint

The High Low Endpoint returns the addresses of the accounts with the highest and lowest SuperMarioCoin balances. This endpoint accepts no inputs.

### Sample Input

```json
{
  "id": "1",
  "data": {
    "endpoint": "highlow"
  }
}
```

### Sample Output

```json
{
    "jobRunID": "1",
    "result": {
        "highestBalanceAddress": "1MejgD79BrWdMzFVuF9JxRC1sXury17LUp",
        "lowestBalanceAddress": "15XPFnJAjPiyTi59BexgHpQBMsA9xzjNn9"
    },
    "statusCode": 200,
    "data": [...]
}
```
