import { defineChain } from 'viem/utils/chain/defineChain.js'

export const duckchainTestnet = /*#__PURE__*/ defineChain({
  id: 202105,
  name: 'DuckChain Testnet',
  nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.duckchain.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'OKLink',
      url: 'https://www.oklink.com/duckchain-testnet',
    },
    okx: {
      name: 'OKX',
      url: 'https://www.okx.com/web3/explorer/duckchain-testnet',
    },
    duckchain: {
      name: 'DuckChain Scan',
      url: 'https://testnet-scan.duckchain.io/',
    },
  },
  testnet: true,
})
