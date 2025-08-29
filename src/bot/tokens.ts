const tokensRaw = [
  {
    symbol: "TON",
    name: "DUCK",
    imageUrl:
      "https://static.okx.com/cdn/web3/currency/token/large/5545-0xda65892ea771d3268610337e9964d916028b7dad-105",
    cg_id: "duck",
  },
  {
    symbol: "USDT",
    name: "Tether",
    imageUrl:
      "https://static.okx.com/cdn/web3/currency/token/large/5545-0xbe138ad5d41fdc392ae0b61b09421987c1966cc3-105",
    cg_id: "usdt",
  },
  {
    symbol: "WTON",
    name: "Wrapped TON",
    imageUrl:
      "https://static.okx.com/cdn/web3/currency/token/large/5545-0x7f9308e8d724e724ec31395f3af52e0593bb2e3f-105",
    cg_id: "ton",
  },
] as const;

export const tokens = tokensRaw.filter((token) => !!token.cg_id);
