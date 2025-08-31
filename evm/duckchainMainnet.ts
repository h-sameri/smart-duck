import { defineChain } from 'viem/chains/utils'

export const duckchainMainnet = /*#__PURE__*/ defineChain({
  id: 5545,
  name: 'DuckChain Mainnet',
  nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://rpc.duckchain.io/', 'https://rpc-hk.duckchain.io/'],
    },
  },
  blockExplorers: {
    default: {
      name: 'OKLink',
      url: 'https://www.oklink.com/duckchain-testnet',
    },
    duckchain: {
      name: 'DuckChain Scan',
      url: 'https://scan.duckchain.io/',
    },
  },
  testnet: true,
})
