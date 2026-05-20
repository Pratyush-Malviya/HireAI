import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import mammoth from 'mammoth';

// Set up PDF worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// In-memory cache to store extracted text mapped by content hash
const textCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

async function getFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function extractTextFromFile(file: File): Promise<string> {
  console.log('Extracting text from:', file.name, 'Size:', file.size);
  
  // Calculate hash to check cache
  const hash = await getFileHash(file);
  if (textCache.has(hash)) {
    console.log('Cache hit for:', file.name);
    const cachedText = textCache.get(hash)!;
    // LRU Refresh: delete and re-insert to move to end (most recently used)
    textCache.delete(hash);
    textCache.set(hash, cachedText);
    return cachedText;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  let extractedText = '';
  try {
    if (extension === 'pdf') {
      extractedText = await extractTextFromPdf(file);
    } else if (extension === 'docx') {
      extractedText = await extractTextFromDocx(file);
    } else if (extension === 'doc') {
      throw new Error('Old .doc format is not supported. Please use .docx or .pdf.');
    } else if (extension === 'txt') {
      extractedText = await file.text();
    } else {
      throw new Error('Unsupported file format: ' + extension);
    }

    // Cache the result with LRU eviction
    if (textCache.size >= MAX_CACHE_SIZE) {
      // Map keys are in insertion order, so the first one is the oldest (LRU)
      const oldestKey = textCache.keys().next().value;
      if (oldestKey) {
        textCache.delete(oldestKey);
      }
    }
    textCache.set(hash, extractedText);
    return extractedText;
  } catch (err: any) {
    console.error('Extraction failed for ' + file.name + ':', err);
    throw err;
  }
}

async function extractTextFromPdf(file: File): Promise<string> {
  console.log('Starting PDF extraction...');
  const arrayBuffer = await file.arrayBuffer();
  console.log('ArrayBuffer ready, loading document...');
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  console.log('PDF loaded, pages:', pdf.numPages);
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    console.log('Reading page', i);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(' ') + '\n';
  }

  return fullText;
}

async function extractTextFromDocx(file: File): Promise<string> {
  console.log('Starting DOCX extraction...');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  console.log('DOCX extraction complete');
  return result.value;
}
