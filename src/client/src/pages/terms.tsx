import Layout from "./layout";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import MarkdownRenderer from "@/src/lib/components/custom/MarkdownRenderer";
import { Button } from "@/src/lib/components/ui/button";

export default function TermsPage() {
    const [markdownContent, setMarkdownContent] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    // Fetch markdown content from TNC folder
    useEffect(() => {
        setIsLoading(true);
        setError("");

        fetch("/static/docs/tnc/1.md")
            .then(response => {
                if (!response.ok) {
                    throw new Error("Failed to load terms and conditions");
                }
                return response.text();
            })
            .then(content => {
                setMarkdownContent(content);
                setIsLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setIsLoading(false);
            });
    }, []);

    return (
        <Layout>
            <div className="min-h-full px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="space-y-8"
                    >
                        {/* Content */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key="terms-content"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                                className="prose prose-lg max-w-none space-y-6"
                            >
                                {isLoading ? (
                                    <div className="space-y-4">
                                        <div className="h-8 bg-muted animate-pulse rounded" />
                                        <div className="space-y-2">
                                            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                                            <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                                            <div className="h-4 bg-muted animate-pulse rounded w-5/6" />
                                        </div>
                                    </div>
                                ) : error ? (
                                    <div className="space-y-4">
                                        <div className="p-4 border-2 border-red-500 bg-red-50 text-red-700">
                                            <p className="font-medium">Failed to load terms and conditions</p>
                                            <p className="text-sm">{error}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <MarkdownRenderer content={markdownContent} />
                                )}
                            </motion.div>
                        </AnimatePresence>

                        {/* Back to Home Button */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.2 }}
                            className="flex justify-center pb-8"
                        >
                            <Button variant="primary" asChild>
                                <Link to="/">
                                    Back to Home
                                </Link>
                            </Button>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </Layout>
    );
}
