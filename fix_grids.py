import re

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Find cases where grid-cols-X is used without responsive prefixes
    # e.g., <div className="grid grid-cols-2 gap-4">
    
    # We will use negative lookbehinds to ensure we don't match `md:grid-cols-2` etc.
    # Note: re module doesn't support variable length lookbehinds, but `(?<![a-z]:)` works.
    
    # Replace grid-cols-2 with grid-cols-1 md:grid-cols-2
    content = re.sub(r'(?<![a-z]:)grid-cols-2\b', r'grid-cols-1 md:grid-cols-2', content)
    # Replace grid-cols-3 with grid-cols-1 lg:grid-cols-3
    content = re.sub(r'(?<![a-z]:)grid-cols-3\b', r'grid-cols-1 lg:grid-cols-3', content)
    # Replace grid-cols-4 with grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
    content = re.sub(r'(?<![a-z]:)grid-cols-4\b', r'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', content)
    # Replace grid-cols-5 with grid-cols-2 lg:grid-cols-5
    content = re.sub(r'(?<![a-z]:)grid-cols-5\b', r'grid-cols-2 lg:grid-cols-5', content)

    # Let's fix some possible specific issues
    # If we created `grid-cols-1 md:grid-cols-1 md:grid-cols-2` by mistake:
    content = content.replace('grid-cols-1 md:grid-cols-1 md:grid-cols-2', 'grid-cols-1 md:grid-cols-2')
    content = content.replace('grid-cols-1 lg:grid-cols-1 lg:grid-cols-3', 'grid-cols-1 lg:grid-cols-3')
    content = content.replace('grid-cols-1 sm:grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed grid responsiveness")

if __name__ == '__main__':
    main()
