import os
import re

TARGET_FILE = r'c:\Users\sony\OneDrive\Desktop\HireAI\src\App.tsx'

def apply_theme():
    if not os.path.exists(TARGET_FILE):
        print(f"File {TARGET_FILE} not found.")
        return

    with open(TARGET_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replacements
    replacements = {
        r'\bindigo-600\b': 'brand-dark',
        r'\bindigo-500\b': 'brand',
        r'\bindigo-400\b': 'brand-light',
        r'\bindigo-300\b': 'brand-light',
        r'\bslate-950\b': '[#0d1117]',
        r'\bslate-900\b': '[#161b22]',
        r'\bslate-800\b': '[#30363d]',
        r'\bslate-700\b': '[#30363d]', # Map 700 to the same border/bg
        r'\bslate-400\b': '[#8b949e]',
        r'\bslate-300\b': '[#c9d1d9]',
        r'\bslate-200\b': '[#e6edf3]',
        r'\bfrom-indigo-600\b': 'from-brand-dark',
        r'\bto-indigo-600\b': 'to-brand-dark',
        r'\bfrom-indigo-500\b': 'from-brand',
        r'\bto-indigo-500\b': 'to-brand',
        r'\bvia-indigo-500\b': 'via-brand',
        r'\bfocus:ring-indigo-500\b': 'focus:ring-brand',
        r'\btext-indigo-400\b': 'text-brand-light',
        r'\btext-indigo-500\b': 'text-brand',
        r'\bbg-indigo-500/10\b': 'bg-brand/10',
        r'\bbg-indigo-500/20\b': 'bg-brand/20',
        r'\bhover:bg-indigo-50\b': 'hover:bg-brand/10',
        r'\btext-indigo-600\b': 'text-brand-dark',
    }

    new_content = content
    for pattern, repl in replacements.items():
        new_content = re.sub(pattern, repl, new_content)

    with open(TARGET_FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"Successfully applied GitHub Dark theme replacements to {TARGET_FILE}.")

if __name__ == '__main__':
    apply_theme()
