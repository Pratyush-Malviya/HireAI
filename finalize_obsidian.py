import os
import re

TARGET_DIR = r'c:\Users\sony\OneDrive\Desktop\HireAI\src'

def finalize_obsidian():
    for root, dirs, files in os.walk(TARGET_DIR):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()

                new_content = content
                
                # Strip legacy light/dark hex codes to pure Tailwind variables
                new_content = new_content.replace('bg-[#0d1117]', 'transparent')
                new_content = new_content.replace('bg-[#161b22]', 'glass-premium')
                new_content = new_content.replace('bg-[#21262d]', 'bg-white/5')
                new_content = new_content.replace('bg-[#30363d]', 'bg-white/10')
                new_content = new_content.replace('bg-[#e6edf3]', 'bg-white/10')
                
                new_content = new_content.replace('border-[#30363d]', 'border-white/10')
                new_content = new_content.replace('border-[#e6edf3]', 'border-white/10')
                new_content = new_content.replace('border-[#c9d1d9]', 'border-white/20')
                
                new_content = new_content.replace('text-[#c9d1d9]', 'text-slate-200')
                new_content = new_content.replace('text-[#e6edf3]', 'text-white')
                new_content = new_content.replace('text-[#8b949e]', 'text-slate-400')
                
                # Standardize primary colors to brand gradients
                # The user wants Indigo/Fuchsia accents
                new_content = new_content.replace('bg-brand hover:bg-brand-dark', 'bg-gradient-to-r from-brand to-brand-light hover:opacity-90 shadow-lg')
                new_content = new_content.replace('bg-brand-dark hover:bg-brand-dark', 'bg-gradient-to-r from-brand to-brand-light hover:opacity-90 shadow-lg')
                
                # Make sure the UI doesn't have black text inside buttons
                new_content = new_content.replace('text-[#0d1117]', 'text-white')
                new_content = new_content.replace('text-[#161b22]', 'text-white')
                
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Finalized Obsidian Option C colors in {file}")

if __name__ == '__main__':
    finalize_obsidian()
