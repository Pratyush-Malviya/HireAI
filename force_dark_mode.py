import os
import re
from glob import glob

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content

    # 1. Backgrounds & Surfaces (Light to Dark)
    new_content = re.sub(r'\bbg-slate-50\b', 'bg-[#0d1117]', new_content)
    new_content = re.sub(r'\bbg-white\b', 'bg-[#161b22]', new_content)
    new_content = re.sub(r'\bbg-slate-100\b', 'bg-[#21262d]', new_content)
    new_content = re.sub(r'\bbg-slate-200\b', 'bg-[#30363d]', new_content)
    new_content = re.sub(r'\bfrom-white\b', 'from-[#161b22]', new_content)
    new_content = re.sub(r'\bvia-white\b', 'via-[#161b22]', new_content)
    new_content = re.sub(r'\bto-white\b', 'to-[#161b22]', new_content)

    # 2. Text Colors (Dark to Light)
    new_content = re.sub(r'\btext-slate-900\b', 'text-[#c9d1d9]', new_content)
    new_content = re.sub(r'\btext-\[\#161b22\]\b', 'text-[#c9d1d9]', new_content) # From previous script run
    new_content = re.sub(r'\btext-slate-800\b', 'text-[#c9d1d9]', new_content)
    new_content = re.sub(r'\btext-\[\#30363d\]\b', 'text-[#c9d1d9]', new_content) # From previous script run
    new_content = re.sub(r'\btext-slate-700\b', 'text-[#c9d1d9]', new_content)
    new_content = re.sub(r'\btext-slate-600\b', 'text-[#8b949e]', new_content)
    new_content = re.sub(r'\btext-slate-500\b', 'text-[#8b949e]', new_content)

    # 3. Borders (Light to Dark)
    new_content = re.sub(r'\bborder-slate-100\b', 'border-[#30363d]', new_content)
    new_content = re.sub(r'\bborder-slate-200\b', 'border-[#30363d]', new_content)
    new_content = re.sub(r'\bborder-\[\#e6edf3\]\b', 'border-[#30363d]', new_content) # From previous script run
    
    # 4. Indigo / Brand Accents
    # We map specific tailwind prefix + indigo to brand variants
    def replace_indigo(match):
        prefix = match.group(1) # e.g., 'bg-', 'text-', 'border-', 'hover:bg-', 'from-', 'ring-'
        shade = match.group(2)  # e.g., '50', '600', '650'
        opacity = match.group(3) or '' # e.g., '/50'
        
        shade_num = int(shade)
        if shade_num <= 100:
            return f"{prefix}brand/10"
        elif shade_num <= 200:
            return f"{prefix}brand/20"
        elif shade_num <= 400:
            return f"{prefix}brand-light{opacity}"
        elif shade_num <= 650:
            return f"{prefix}brand{opacity}"
        else:
            return f"{prefix}brand-dark{opacity}"

    # Matches text-indigo-500, hover:bg-indigo-650/50, etc.
    pattern = r'([a-zA-Z0-9:-]+?)indigo-([0-9]{2,3})(/[0-9]+)?'
    new_content = re.sub(pattern, replace_indigo, new_content)

    # Replace lingering specific arbitrary values if any
    new_content = re.sub(r'\bbg-slate-950\b', 'bg-[#0d1117]', new_content)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    target_dir = r'c:\Users\sony\OneDrive\Desktop\HireAI\src'
    for root, dirs, files in os.walk(target_dir):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                process_file(os.path.join(root, file))

if __name__ == '__main__':
    main()
