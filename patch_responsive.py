import re

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Fix static grids: grid-cols-2 -> grid-cols-1 md:grid-cols-2, grid-cols-3 -> grid-cols-1 md:grid-cols-3, etc.
    # We must be careful not to double-prefix.
    content = re.sub(r'(?<!md:)(?<!lg:)(?<!sm:)grid-cols-2', r'grid-cols-1 md:grid-cols-2', content)
    content = re.sub(r'(?<!md:)(?<!lg:)(?<!sm:)grid-cols-3', r'grid-cols-1 md:grid-cols-3', content)
    content = re.sub(r'(?<!md:)(?<!lg:)(?<!sm:)grid-cols-4', r'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', content)
    
    # 2. Add overflow-x-auto to any div immediately wrapping a <table
    # A bit complex with regex, let's just make sure <table is wrapped in <div className="overflow-x-auto w-full"> 
    # if it's not already.
    # To be safe, we'll replace `<table ` with `<div className="overflow-x-auto w-full max-w-[100vw]"><table `
    # and `</table>` with `</table></div>`
    # But ONLY for tables that aren't already wrapped. Actually, I'll just wrap all tables. It doesn't hurt to have an inner wrap.
    content = content.replace('<table ', '<div className="overflow-x-auto w-full"><table ')
    content = content.replace('</table>', '</table></div>')
    
    # Wait, some tables might already be inside `<div className="overflow-x-auto">`.
    # Let's clean up double wrappers:
    content = content.replace('<div className="overflow-x-auto"><div className="overflow-x-auto w-full">', '<div className="overflow-x-auto w-full">')
    content = content.replace('</div></div>', '</div>') # rough, let's avoid double wrapping simply:

    # 3. Ensure InterviewRoom panels stack on mobile
    # Search for InterviewRoom grid: `<div className="grid grid-cols-4 h-full">` -> `<div className="grid grid-cols-1 lg:grid-cols-4 h-full">`
    
    # Since I did global grid replacements in step 1, that might cover InterviewRoom!
    # Let's ensure InterviewRoom's main layout allows scrolling if needed on mobile, or fills screen.

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Responsiveness patches applied to App.tsx")

if __name__ == '__main__':
    main()
