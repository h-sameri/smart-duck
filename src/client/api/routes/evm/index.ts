import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { respond } from "@/api/lib/utils/respond";
import { isAddress, parseEther } from "viem";
import { fundWalletWithUSDT } from "@/api/lib/utils/evm";

const evm = new Hono()
  .get(
    "/faucet/usdt",
    zValidator(
      "query",
      z.object({
        address: z.string(),
      })
    ),
    async (ctx) => {
      const { address } = ctx.req.valid("query");

      if (!address) {
        return respond.err(ctx, "Address is required", 400);
      }

      if (!isAddress(address)) {
        return respond.err(ctx, "Invalid address", 400);
      }

      const amount = "100";
      await fundWalletWithUSDT(address, parseEther(amount));

      return respond.ok(
        ctx,
        {
          address,
          amount,
        },
        "Successfully funded wallet",
        200
      );
    }
  )

export default evm;
export type EvmType = typeof evm;
