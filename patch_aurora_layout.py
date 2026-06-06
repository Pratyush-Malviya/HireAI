import os
import re

TARGET_FILE = r'c:\Users\sony\OneDrive\Desktop\HireAI\src\App.tsx'

def patch_layout():
    if not os.path.exists(TARGET_FILE):
        print(f"File {TARGET_FILE} not found.")
        return

    with open(TARGET_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content

    # 1. Update the main application wrapper
    # Replace the exact wrapper string
    wrapper_pattern = r'<div className="flex h-screen bg-\[#0d1117\] font-sans text-\[#c9d1d9\] selection:bg-\[#238636\]/30 overflow-hidden">'
    new_wrapper = '<div className="flex h-screen w-full bg-transparent font-sans text-[#e2e8f0] selection:bg-[#6366f1]/30 overflow-hidden p-4 gap-4 relative">'
    new_content = re.sub(wrapper_pattern, new_wrapper, new_content)

    # If it was light mode before the first script
    wrapper_pattern2 = r'<div className="flex h-screen bg-slate-50 font-sans text-\[#161b22\] selection:bg-indigo-100 overflow-hidden">'
    new_content = re.sub(wrapper_pattern2, new_wrapper, new_content)

    # 2. Update the Sidebar
    # The sidebar currently has bg-[#0d1117] and border-r border-[#30363d]
    sidebar_pattern = r'className=\{cn\(\s*"flex flex-col bg-\[#0d1117\] border-r border-\[#30363d\] transition-all duration-300 relative",'
    new_sidebar = 'className={cn("flex flex-col glass-premium transition-all duration-300 relative h-full",'
    new_content = re.sub(sidebar_pattern, new_sidebar, new_content)

    sidebar_pattern2 = r'className=\{cn\(\s*"flex flex-col bg-white border-r border-\[#e6edf3\] transition-all duration-300 relative",'
    new_content = re.sub(sidebar_pattern2, new_sidebar, new_content)

    # 3. Restore Indigo brand colors that were overwritten to green
    new_content = new_content.replace('bg-brand-dark hover:bg-brand-dark', 'bg-gradient-to-r from-[#6366f1] to-[#d946ef] hover:opacity-90 shadow-[0_0_20px_rgba(99,102,241,0.4)]')
    new_content = new_content.replace('bg-brand hover:bg-brand-dark', 'bg-gradient-to-r from-[#6366f1] to-[#d946ef] hover:opacity-90 shadow-[0_0_15px_rgba(99,102,241,0.3)]')
    
    # Text replacements to restore white/light slate
    new_content = new_content.replace('text-[#c9d1d9]', 'text-slate-300')
    new_content = new_content.replace('text-[#8b949e]', 'text-slate-400')
    new_content = new_content.replace('bg-[#161b22]', 'glass-premium')
    new_content = new_content.replace('bg-[#0d1117]', 'transparent')
    new_content = new_content.replace('border-[#30363d]', 'border-white/10')
    
    # Also fix the top header (which was bg-white or bg-[#0d1117])
    header_pattern = r'<header className="bg-transparent border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 z-40">'
    new_header = '<header className="glass-premium mb-4 px-6 py-4 flex items-center justify-between sticky top-0 z-40">'
    new_content = new_content.replace(header_pattern, new_header)

    # And for original light mode strings if they exist
    header_pattern2 = r'<header className="bg-white border-b border-\[#e6edf3\] px-6 py-4 flex items-center justify-between sticky top-0 z-40">'
    new_content = new_content.replace(header_pattern2, new_header)

    # The <main> wrapper to add some rounded corners if needed
    main_pattern = r'<main className="flex-1 overflow-y-auto bg-transparent relative">'
    new_main = '<main className="flex-1 overflow-y-auto bg-transparent relative rounded-3xl">'
    new_content = new_content.replace(main_pattern, new_main)

    if new_content != content:
        with open(TARGET_FILE, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Successfully applied Premium Aurora layout patches to App.tsx")
    else:
        print("No changes made to App.tsx. Regex patterns might not have matched.")

if __name__ == '__main__':
    patch_layout()
