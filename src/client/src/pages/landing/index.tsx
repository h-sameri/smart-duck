import { Button } from "@/src/lib/components/ui/button";
import Layout from "../layout";
import { motion } from "motion/react";
import { Image } from "@/src/lib/components/custom/Image";
import { Link } from "@tanstack/react-router";
import { useTheme } from "@/src/lib/context/theme-provider";

export default function HomePage() {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    return (
        <Layout>
            <div className="h-full flex flex-col overflow-y-clip">
                {/* Main Content */}
                <div className="flex-1 flex items-center justify-center p-4 md:p-6">
                    <div className="w-full lg:max-w-4xl xl:max-w-5xl 2xl:max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
                        {/* Left Side - Big Text */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4 }}
                            className="space-y-4 md:space-y-6 text-center lg:text-left"
                        >
                            <div className="">
                                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold text-primary tracking-tight leading-tight">
                                    Smart Duck
                                </h1>
                                <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground leading-relaxed mt-2 md:mt-4">
                                    fast, precise, and secure trading on duckchain
                                </p>
                            </div>

                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.2 }}
                                className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center lg:justify-start"
                            >
                                <Button variant="primary" size="lg" className="w-full sm:w-auto" asChild>
                                    <a href="https://t.me/smart_duckchain_bot" target="_blank">
                                        get started
                                    </a>
                                </Button>
                                <div>
                                    <Button variant="link" size="lg" className="w-full sm:w-auto" asChild>
                                        <Link to="/docs">
                                            see docs
                                        </Link>
                                    </Button>
                                    <Button variant="link" size="lg" className="w-full sm:w-auto" asChild>
                                        <a href="https://youtu.be/" target="_blank" rel="noopener noreferrer">
                                            watch demo
                                        </a>
                                    </Button>   
                                </div>
                            </motion.div>
                        </motion.div>

                        {/* Right Side - Big Logo */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                            className="flex justify-center lg:justify-end order-first lg:order-last"
                        >
                            <motion.div
                                initial={{ scale: 0.9 }}
                                animate={{ 
                                    scale: 1,
                                    y: [0, -10, 0]
                                }}
                                transition={{ 
                                    duration: 0.6, 
                                    delay: 0.3,
                                    y: {
                                        duration: 10,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }
                                }}
                                className="relative"
                            >
                                <Image
                                    src="/static/images/logo.png"
                                    alt="Smart Duck"
                                    className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 lg:w-80 lg:h-80 object-contain"
                                />
                            </motion.div>
                        </motion.div>
                    </div>
                </div>

                {/* Footer */}
                <motion.footer
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.5 }}
                    className="border-t border-border/50 bg-background/50 backdrop-blur-sm"
                >
                    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
                        <div className="flex flex-col md:flex-row justify-evenly items-center gap-4">
                            <div className="text-sm text-muted-foreground">
                                © 2025 Smart Duck. All rights reserved.
                            </div>
                            <div className="flex items-center gap-6 text-sm">
                                <a
                                    href="https://github.com/h-sameri/smart-duck"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-muted-foreground hover:text-primary flex items-center gap-2 transition-colors"
                                >
                                    GitHub Repository
                                </a>

                                <Link
                                    to="/terms"
                                    target="_blank"
                                    className="text-muted-foreground hover:text-primary transition-colors"
                                >
                                    Terms & Conditions
                                </Link>
                            </div>
                        </div>
                    </div>
                </motion.footer>
            </div>
        </Layout>
    )
}