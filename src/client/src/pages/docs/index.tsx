import Layout from "../layout";
import { useState, useEffect, memo } from "react";
import { Input } from "@/src/lib/components/ui/input";
import { Button } from "@/src/lib/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import Icon from "@/src/lib/components/custom/Icon";
import { icons } from "lucide-react";
import MarkdownRenderer from "@/src/lib/components/custom/MarkdownRenderer";

// Documentation topics based on new folder structure
const topics: Array<{ 
    id: string; 
    title: string; 
    icon: keyof typeof icons; 
    subtopics: Array<{ id: string; title: string; file: string }> 
}> = [
    {
        id: "getting-started",
        title: "Getting Started",
        icon: "BookOpen",
        subtopics: [
            { id: "overview", title: "Overview", file: "getting-started/overview.md" },
            { id: "accessing-smart-duck", title: "Accessing Smart Duck", file: "getting-started/accessing-smart-duck.md" },
            { id: "creating-agents", title: "Creating Agents", file: "getting-started/creating-agents.md" },
            { id: "funding-agents", title: "Funding Agents", file: "getting-started/funding-agents.md" },
            { id: "trading-with-ai", title: "Trading with AI", file: "getting-started/trading-with-ai.md" },
            { id: "settings-customization", title: "Settings & Customization", file: "getting-started/settings-customization.md" },
            { id: "troubleshooting", title: "Troubleshooting", file: "getting-started/troubleshooting.md" }
        ]
    },
    {
        id: "architecture",
        title: "Architecture",
        icon: "Building2",
        subtopics: [
            { id: "overview", title: "System Overview", file: "architecture/overview.md" },
            { id: "data-flow", title: "Data Flow", file: "architecture/data-flow.md" },
            { id: "component-architecture", title: "Component Architecture", file: "architecture/component-architecture.md" },
            { id: "security-architecture", title: "Security Architecture", file: "architecture/security-architecture.md" },
            { id: "performance-architecture", title: "Performance Architecture", file: "architecture/performance-architecture.md" }
        ]
    },
    {
        id: "ai-engine",
        title: "AI Engine",
        icon: "Brain",
        subtopics: [
            { id: "overview", title: "AI Engine Overview", file: "ai-engine/overview.md" },
            { id: "security-validation", title: "Security & Validation", file: "ai-engine/security-validation.md" },
            { id: "ticker-extraction", title: "Ticker Extraction", file: "ai-engine/ticker-extraction.md" },
            { id: "market-data-integration", title: "Market Data Integration", file: "ai-engine/market-data-integration.md" },
            { id: "analysis-engine", title: "Analysis Engine", file: "ai-engine/analysis-engine.md" }
        ]
    },
    {
        id: "smart-contracts",
        title: "Smart Contracts",
        icon: "FileCode",
        subtopics: [
            { id: "overview", title: "Contracts Overview", file: "smart-contracts/overview.md" }
        ]
    }
];

// Sidebar content component - memoized to prevent unnecessary re-renders
const SidebarContent = memo(({ 
    searchQuery, 
    setSearchQuery, 
    filteredTopics, 
    selectedTopic, 
    setSelectedTopic, 
    selectedSubtopic, 
    setSelectedSubtopic 
}: {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    filteredTopics: typeof topics;
    selectedTopic: string;
    setSelectedTopic: (topic: string) => void;
    selectedSubtopic: string;
    setSelectedSubtopic: (subtopic: string) => void;
}) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full h-full space-y-6 p-6"
    >
        <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-primary tracking-tight">
                Documentation
            </h2>
            
            {/* Search Bar */}
            <div className="space-y-2">
                <Input
                    placeholder="search topics..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border-2 border-border"
                />
            </div>
        </div>

        {/* Topics List */}
        <nav className="space-y-3">
            <AnimatePresence mode="wait">
                {filteredTopics.map((topic) => (
                    <motion.div
                        key={topic.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-1"
                    >
                        {/* Topic Header */}
                        <Button
                            variant={selectedTopic === topic.id ? "primary" : "ghost"}
                            onClick={() => {
                                setSelectedTopic(topic.id);
                                setSelectedSubtopic(topic.subtopics[0]?.id || "");
                            }}
                            className="w-full justify-start gap-3 h-auto p-3 border-2 border-border hover:border-primary"
                        >
                            <Icon name={topic.icon} className="w-4 h-4" />
                            <span className="text-left font-medium">{topic.title}</span>
                        </Button>

                        {/* Subtopic List */}
                        {selectedTopic === topic.id && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="ml-4 space-y-0.5"
                            >
                                {topic.subtopics.map((subtopic) => (
                                    <Button
                                        key={subtopic.id}
                                        variant={selectedSubtopic === subtopic.id ? "secondary" : "ghost"}
                                        onClick={() => {
                                            setSelectedSubtopic(subtopic.id);
                                        }}
                                        className="w-full justify-start h-auto p-2 text-sm hover:bg-accent/50 border-l-2 border-transparent hover:border-border data-[state=active]:border-primary data-[state=active]:bg-primary/10"
                                        data-state={selectedSubtopic === subtopic.id ? "active" : "inactive"}
                                    >
                                        <span className="text-left text-muted-foreground data-[state=active]:text-primary">
                                            {subtopic.title}
                                        </span>
                                    </Button>
                                ))}
                            </motion.div>
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </nav>
    </motion.div>
));

export default function DocsPage() {
    const [selectedTopic, setSelectedTopic] = useState("getting-started");
    const [selectedSubtopic, setSelectedSubtopic] = useState("overview");
    const [searchQuery, setSearchQuery] = useState("");
    const [markdownContent, setMarkdownContent] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    const currentTopic = topics.find(topic => topic.id === selectedTopic);
    const currentSubtopic = currentTopic?.subtopics.find(subtopic => subtopic.id === selectedSubtopic);

    const filteredTopics = topics.filter(topic =>
        topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        topic.subtopics.some(subtopic => 
            subtopic.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    // Fetch markdown content
    useEffect(() => {
        if (!currentSubtopic) return;

        setIsLoading(true);
        setError("");

        fetch(`/static/docs/guide/${currentSubtopic.file}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${currentSubtopic.file}`);
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
    }, [selectedTopic, selectedSubtopic, currentSubtopic]);

    return (
        <Layout mobileMenuContent={
            <SidebarContent 
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                filteredTopics={filteredTopics}
                selectedTopic={selectedTopic}
                setSelectedTopic={setSelectedTopic}
                selectedSubtopic={selectedSubtopic}
                setSelectedSubtopic={setSelectedSubtopic}
            />
        }>
            <div className="h-full flex">
                {/* Desktop Sidebar - Hidden on mobile */}
                <div className="hidden md:block w-80 border-r border-border bg-card">
                    <SidebarContent 
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        filteredTopics={filteredTopics}
                        selectedTopic={selectedTopic}
                        setSelectedTopic={setSelectedTopic}
                        selectedSubtopic={selectedSubtopic}
                        setSelectedSubtopic={setSelectedSubtopic}
                    />
                </div>

                {/* Content Area */}
                <div className="flex-1 p-4 md:p-8 overflow-y-auto md:ml-0">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${selectedTopic}-${selectedSubtopic}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className="max-w-4xl"
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
                                    <h1 className="text-4xl font-semibold text-primary tracking-tight">
                                        Error Loading Document
                                    </h1>
                                    <div className="p-4 border-2 border-red-500 bg-red-50 text-red-700">
                                        <p className="font-medium">Failed to load documentation</p>
                                        <p className="text-sm">{error}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <MarkdownRenderer content={markdownContent} />
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </Layout>
    );
}