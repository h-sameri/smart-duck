import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/src/lib/utils';
import { useTheme } from '@/src/lib/context/theme-provider';
import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const { theme } = useTheme();
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');
  
  useEffect(() => {
    const updateTheme = () => {
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        setCurrentTheme(systemTheme);
      } else {
        setCurrentTheme(theme as 'light' | 'dark');
      }
    };

    updateTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', updateTheme);

    return () => mediaQuery.removeEventListener('change', updateTheme);
  }, [theme]);
  
  // Select appropriate syntax highlighting theme
  const syntaxTheme = currentTheme === 'dark' ? oneDark : oneLight;

  const components: Components = {
    // Customize code blocks
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const [copied, setCopied] = useState(false);
      
      const copyToClipboard = async () => {
        const codeContent = String(children).replace(/\n$/, '');
        try {
          await navigator.clipboard.writeText(codeContent);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.error('Failed to copy code:', err);
        }
      };

      return !inline && match ? (
        <div className="relative group">
          <button
            onClick={copyToClipboard}
            className="absolute top-2 right-2 p-2 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100 z-10"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <SyntaxHighlighter
            style={syntaxTheme}
            language={match[1]}
            PreTag="div"
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code className="bg-muted/50 px-1 py-0.5 rounded text-sm text-foreground" {...props}>
          {children}
        </code>
      );
    },
    // Customize links
    a({ children, href, ...props }: any) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 underline decoration-primary/50 hover:decoration-primary"
          {...props}
        >
          {children}
        </a>
      );
    },
    // Customize blockquotes
    blockquote({ children, ...props }: any) {
      return (
        <blockquote
          className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground"
          {...props}
        >
          {children}
        </blockquote>
      );
    },
    // Customize tables
    table({ children, ...props }: any) {
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-border/50" {...props}>
            {children}
          </table>
        </div>
      );
    },
    th({ children, ...props }: any) {
      return (
        <th
          className="border border-border/50 px-3 py-2 text-left font-semibold bg-muted/50 text-foreground"
          {...props}
        >
          {children}
        </th>
      );
    },
    td({ children, ...props }: any) {
      return (
        <td className="border border-border/50 px-3 py-2 text-foreground" {...props}>
          {children}
        </td>
      );
    },
    // Customize lists
    ul({ children, ...props }: any) {
      return (
        <ul className="list-disc list-outside ml-4 space-y-1" {...props}>
          {children}
        </ul>
      );
    },
    ol({ children, ...props }: any) {
      return (
        <ol className="list-decimal list-outside ml-4 space-y-1" {...props}>
          {children}
        </ol>
      );
    },
    // Customize headings
    h1({ children, ...props }: any) {
      return (
        <h1 className="text-2xl font-bold mt-6 mb-4" {...props}>
          {children}
        </h1>
      );
    },
    h2({ children, ...props }: any) {
      return (
        <h2 className="text-xl font-semibold mt-5 mb-3" {...props}>
          {children}
        </h2>
      );
    },
    h3({ children, ...props }: any) {
      return (
        <h3 className="text-lg font-medium mt-4 mb-2" {...props}>
          {children}
        </h3>
      );
    },
    // Customize paragraphs
    p({ children, ...props }: any) {
      return (
        <p className="mb-3 last:mb-0" {...props}>
          {children}
        </p>
      );
    },
  };

  return (
    <div className={cn(
      'prose prose-sm sm:prose-base max-w-none',
      'prose-headings:text-foreground',
      'prose-p:text-foreground',
      'prose-strong:text-foreground',
      'prose-em:text-foreground',
      'prose-code:text-foreground prose-code:bg-muted/50',
      'prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/50',
      'prose-blockquote:text-muted-foreground prose-blockquote:border-l-muted-foreground/30',
      'prose-ul:text-foreground prose-ol:text-foreground',
      'prose-li:text-foreground',
      'prose-table:text-foreground',
      'prose-th:text-foreground prose-td:text-foreground',
      'prose-a:text-primary hover:prose-a:text-primary/80',
      className
    )}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
} 