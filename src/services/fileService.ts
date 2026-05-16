import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import mammoth from 'mammoth';

// Set up PDF worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function extractTextFromFile(file: File): Promise<string> {
  console.log('Extracting text from:', file.name, 'Size:', file.size);
  const extension = file.name.split('.').pop()?.toLowerCase();
  try {
    if (extension === 'pdf') {
      return await extractTextFromPdf(file);
    } else if (extension === 'docx') {
      return await extractTextFromDocx(file);
    } else if (extension === 'doc') {
      throw new Error('Old .doc format is not supported. Please use .docx or .pdf.');
    } else if (extension === 'txt') {
      return file.text();
    } else {
      throw new Error('Unsupported file format: ' + extension);
    }
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
