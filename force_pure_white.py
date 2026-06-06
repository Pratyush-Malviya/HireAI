import os
import re

TARGET_DIR = r'c:\Users\sony\OneDrive\Desktop\HireAI\src'

def force_pure_white_text():
    for root, dirs, files in os.walk(TARGET_DIR):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()

                new_content = content
                
                # Replace ALL text colors with text-white
                new_content = re.sub(r'text-slate-\d00', 'text-white', new_content)
                new_content = new_content.replace('text-[#e2e8f0]', 'text-white')
                new_content = new_content.replace('text-gray-900', 'text-white')
                new_content = new_content.replace('text-brand-light', 'text-white')
                
                # Re-fix buttons and interactive elements for dark mode
                new_content = new_content.replace('bg-slate-50', 'bg-transparent')
                new_content = new_content.replace('bg-slate-100', 'bg-white/5')
                new_content = new_content.replace('border-slate-200', 'border-white/10')
                new_content = new_content.replace('border-slate-300', 'border-white/20')
                
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Forced pure white text in {file}")

if __name__ == '__main__':
    force_pure_white_text()
