import re
import os

def main():
    file_path = 'src/App.tsx'
    if not os.path.exists(file_path):
        print(f"File {file_path} not found.")
        return
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Clean up duplicate grid-cols classes that may have been created by previous scripts
    content = content.replace('grid-cols-1 md:grid-cols-1 md:grid-cols-2', 'grid-cols-1 md:grid-cols-2')
    content = content.replace('grid-cols-1 lg:grid-cols-1 lg:grid-cols-3', 'grid-cols-1 lg:grid-cols-3')
    content = content.replace('grid-cols-1 sm:grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')

    # 2. Clean up double overflow wrappers
    content = content.replace('<div className="overflow-x-auto w-full"><div className="overflow-x-auto w-full">', '<div className="overflow-x-auto w-full">')
    
    # 3. Enhance card styles (replace static bg-white rounded shadow with saas-card)
    # Using regex to find typical card container classes and replace them or append saas-card
    # A typical match: className="bg-white rounded-xl border border-slate-200 shadow-sm p-6"
    # We will just append saas-card to the classes of these containers, and remove redundant ones to avoid clash,
    # but saas-card already contains bg-white, border, rounded-2xl, shadow-sm. 
    # It's safer to just inject it in places where `bg-white` is used in combination with `shadow-sm` or `border`
    
    # Instead of destructive regex, let's just make sure "hover:-translate-y-1" or some micro animations are added to buttons
    # Since saas-button and saas-card are already defined in App.tsx (I saw the Button component and Card component), 
    # the user is likely already using them, or using raw divs.
    
    # Let's add micro-animations to some raw interactive elements
    # Add hover:scale-105 to items that look like interactive cards
    content = re.sub(r'className="(bg-white rounded-[a-zA-Z0-9]+ border border-[a-zA-Z0-9-]+ shadow-[a-zA-Z0-9-]+ [^"]*transition[^"]*)"', 
                     r'className="\1 hover:-translate-y-1 hover:shadow-md"', content)
                     
    # Add a glassmorphism effect to the main navbar if it exists
    # Find the nav bar (typically <nav className="... bg-white border-b ...")
    content = re.sub(r'<nav className="([^"]*bg-white[^"]*)"', r'<nav className="\1 glass sticky top-0 z-50"', content)
    
    # Clean up double glass if we injected it multiple times
    content = content.replace('glass sticky top-0 z-50 sticky top-0 z-50', 'glass sticky top-0 z-50')
    content = content.replace('glass glass', 'glass')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("UI/UX fixes applied successfully.")

if __name__ == '__main__':
    main()
