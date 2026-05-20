
import re
import sys

def check_all_tags(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # Clean up comments and strings
    content = re.sub(r'{\s*/\*.*?\*/\s*}', '', content, flags=re.DOTALL)
    content = re.sub(r'//.*?\n', '\n', content)
    # content = re.sub(r'\'[^\']*\'', '\'\'', content)
    # content = re.sub(r'\"[^\"]*\"', '\"\"', content)
    
    stack = []
    # Find all tags
    tags = re.findall(r'<(/?)([a-zA-Z0-9\.]+)([^>]*?)(/?)>', content)
    
    for prefix, name, attrs, suffix in tags:
        if suffix == '/': # Self-closing
            continue
        if prefix == '/': # Closing
            if not stack:
                print(f"Extra closing tag </{name}>")
            else:
                top_name, top_line = stack.pop()
                if top_name != name:
                    print(f"Mismatched closing tag </{name}> for <{top_name}>")
        else: # Opening
            stack.append((name, 0)) # We don't have line numbers easily here but it's okay
            
    for name, line in stack:
        print(f"Unclosed tag <{name}>")

if __name__ == "__main__":
    check_all_tags(sys.argv[1])
