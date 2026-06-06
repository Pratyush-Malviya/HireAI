import os
import re

TARGET_DIR = r'c:\Users\sony\OneDrive\Desktop\HireAI\src'

def fix_fonts():
    for root, dirs, files in os.walk(TARGET_DIR):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()

                new_content = content
                
                # Dark text that is unreadable on dark backgrounds
                new_content = new_content.replace('text-brand-dark', 'text-brand-light')
                new_content = new_content.replace('text-[#161b22]', 'text-white')
                new_content = new_content.replace('text-[#30363d]', 'text-slate-300')
                new_content = new_content.replace('text-slate-500', 'text-slate-400')
                new_content = new_content.replace('text-slate-600', 'text-slate-400')
                new_content = new_content.replace('text-slate-700', 'text-slate-300')
                new_content = new_content.replace('text-slate-800', 'text-slate-300')
                new_content = new_content.replace('text-slate-900', 'text-slate-200')
                
                # Any hover classes
                new_content = new_content.replace('hover:text-brand-dark', 'hover:text-white')
                new_content = new_content.replace('hover:text-[#161b22]', 'hover:text-white')
                
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated font colors in {file}")

if __name__ == '__main__':
    fix_fonts()
