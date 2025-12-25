export interface MediaItem {
  type: 'image' | 'audio' | 'video';
  src: string;
  alt?: string;
  caption?: string;
}

export interface ParsedMedia {
  items: MediaItem[];
  processedContent: string;
}

const MEDIA_BLOCK_REGEX = /```media\n([\s\S]*?)```/g;

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];

function getMediaType(src: string): 'image' | 'audio' | 'video' | null {
  const lower = src.toLowerCase();
  if (IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))) return 'image';
  if (AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext))) return 'audio';
  if (VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext))) return 'video';
  
  if (lower.includes('/image/') || lower.includes('image/')) return 'image';
  if (lower.includes('/audio/') || lower.includes('audio/')) return 'audio';
  if (lower.includes('/video/') || lower.includes('video/')) return 'video';
  
  return null;
}

function parseMediaBlockContent(content: string): MediaItem[] {
  const items: MediaItem[] = [];
  const lines = content.trim().split('\n');
  
  let currentItem: Partial<MediaItem> | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const srcMatch = trimmed.match(/^src:\s*(.+)$/i);
    if (srcMatch) {
      if (currentItem?.src) {
        items.push(currentItem as MediaItem);
      }
      const src = srcMatch[1].trim().replace(/^["']|["']$/g, '');
      currentItem = {
        src,
        type: getMediaType(src) || 'image',
      };
      continue;
    }
    
    const typeMatch = trimmed.match(/^type:\s*(.+)$/i);
    if (typeMatch && currentItem) {
      const type = typeMatch[1].trim().toLowerCase();
      if (type === 'image' || type === 'audio' || type === 'video') {
        currentItem.type = type;
      }
      continue;
    }
    
    const altMatch = trimmed.match(/^alt:\s*(.+)$/i);
    if (altMatch && currentItem) {
      currentItem.alt = altMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }
    
    const captionMatch = trimmed.match(/^caption:\s*(.+)$/i);
    if (captionMatch && currentItem) {
      currentItem.caption = captionMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }
    
    if (!trimmed.includes(':') && (trimmed.startsWith('http') || trimmed.startsWith('/') || trimmed.startsWith('file:'))) {
      if (currentItem?.src) {
        items.push(currentItem as MediaItem);
      }
      currentItem = {
        src: trimmed,
        type: getMediaType(trimmed) || 'image',
      };
    }
  }
  
  if (currentItem?.src) {
    items.push(currentItem as MediaItem);
  }
  
  return items;
}

export function parseMediaContent(content: string): ParsedMedia {
  const items: MediaItem[] = [];
  
  const processedContent = content.replace(MEDIA_BLOCK_REGEX, (_, blockContent) => {
    const blockItems = parseMediaBlockContent(blockContent);
    items.push(...blockItems);
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  
  return { items, processedContent };
}

export function parseUserMediaContent(content: string): { mediaItems: MediaItem[]; textContent: string } {
  const mediaPattern = /\[Media: ([^\]]+)\]/g;
  const mediaItems: MediaItem[] = [];
  let match;
  
  while ((match = mediaPattern.exec(content)) !== null) {
    const path = match[1];
    const type = getMediaType(path);
    if (type) {
      mediaItems.push({
        type,
        src: path,
        alt: path.split('/').pop() || path,
      });
    }
  }
  
  const textContent = content.replace(/\[Media: [^\]]+\]\n*/g, '').trim();
  
  return { mediaItems, textContent };
}

export function isMediaUrl(url: string): boolean {
  return getMediaType(url) !== null;
}

export function getMediaTypeFromUrl(url: string): 'image' | 'audio' | 'video' | null {
  return getMediaType(url);
}
