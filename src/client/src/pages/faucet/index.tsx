import { Button } from "@/src/lib/components/ui/button";
import { useApi } from "@/src/lib/hooks/use-api";
import { Input } from "@/src/lib/components/ui/input";
import { useState, useEffect } from "react";
import Layout from "../layout";
import { motion, AnimatePresence } from "motion/react";
import { useStorePersist } from "@/src/lib/hooks/use-store";
import { truncateText } from "@/src/lib/utils";
import Icon from "@/src/lib/components/custom/Icon";

export default function FaucetPage() {
    const api = useApi();
    const { mutateAsync: getUSDT, status, error } = api.usdtFaucet;
    const [address, setAddress] = useState("");
    const [showSuccess, setShowSuccess] = useState(false);
    const [countdown, setCountdown] = useState(0);

    const { faucetLastUsed, setFaucetLastUsed } = useStorePersist();

    const canUseFaucet = () => {
        if (!faucetLastUsed) return true;
        return Date.now() - faucetLastUsed >= 5 * 60 * 1000; // 5 minutes
    };

    // Countdown timer effect
    useEffect(() => {
        if (!faucetLastUsed) {
            setCountdown(0);
            return;
        }

        const updateCountdown = () => {
            const timeElapsed = Date.now() - faucetLastUsed;
            const cooldownTime = 5 * 60 * 1000; // 5 minutes
            const remaining = Math.max(0, cooldownTime - timeElapsed);
            setCountdown(remaining);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);

        return () => clearInterval(interval);
    }, [faucetLastUsed]);

    const formatCountdown = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (!canUseFaucet()) return;

        try {
            await getUSDT(address);
            setFaucetLastUsed(Date.now());
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err) {
            console.error(err);
        }
    }

    const isLoading = status === "pending";
    const isOnCooldown = !canUseFaucet();

    return (
        <Layout>
            <div className="h-full flex flex-col items-center justify-center gap-8 p-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-center space-y-4"
                >
                    <h1 className="text-4xl font-semibold text-primary tracking-tight">
                        USDT Faucet
                    </h1>
                    <p className="text-muted-foreground">
                        get test USDT for tryinng out the agent.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className="w-full max-w-md"
                >
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Input
                                placeholder="enter your wallet address"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isLoading || !address.trim() || isOnCooldown}
                            className="w-full"
                        >
                            <AnimatePresence mode="wait">
                                {isLoading ? (
                                    <motion.div
                                        key="loading"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="flex items-center gap-2"
                                    >
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                                        />
                                        Processing
                                    </motion.div>
                                ) : isOnCooldown ? (
                                    <motion.div
                                        key="cooldown"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        On Cooldown
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="default"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        Get USDT
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Button>

                        {isOnCooldown && countdown > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-center text-sm text-muted-foreground"
                            >
                                faucet is on cooldown, available in {formatCountdown(countdown)}
                            </motion.div>
                        )}
                    </form>
                </motion.div>

                <AnimatePresence>
                    {showSuccess && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="text-sm text-green-600 font-medium bg-green-600/10 p-2 rounded-none flex items-center gap-2"
                        >
                            <Icon name="Check" className="w-4 h-4" />
                            sent 100 USDT to your wallet
                        </motion.div>
                    )}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="text-sm text-red-600 bg-primary/10 p-2 font-medium flex items-center gap-2"
                        >
                            <Icon name="X" className="w-4 h-4" />
                            {truncateText(error.message || "failed to send tokens", 100)}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Layout>
    );
}