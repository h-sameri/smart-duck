import path from "path";
import { toast } from "sonner";

// Helper function to get MIME type based on file extension
export const getMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

export const copyToClipboard = async (text: string, field: string, setCopiedField?: (field: string | null) => void) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${field} copied to clipboard`);
    if (setCopiedField) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  } catch (err) {
    toast.error('Failed to copy to clipboard');
  }
};