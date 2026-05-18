import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import mammoth from 'mammoth';

// Set up PDF worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// In-memory cache to store extracted text mapped by content hash
const textCache = new Map<string, string>();

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
    return textCache.get(hash)!;
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

    // Cache the result
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
