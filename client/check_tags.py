
import re
import sys

def check_tags(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find all JSX tags
    # Simplified regex for tags: <TAG or </TAG or />
    # We want to find:
    # 1. Opening tags: <div ... > (not ending in />)
    # 2. Closing tags: </div>
    # 3. Self-closing tags: <div ... />
    
    # Let's use a stack to track only <div> tags for now
    stack = []
    
    # Clean up comments first to avoid false positives
    content = re.sub(r'{\s*/\*.*?\*/\s*}', '', content, flags=re.DOTALL)
    content = re.sub(r'//.*?\n', '\n', content)
    
    # Find all div related strings
    pos = 0
    while True:
        div_open = content.find('<div', pos)
        div_close = content.find('</div>', pos)
        
        if div_open == -1 and div_close == -1:
            break
            
        if div_open != -1 and (div_close == -1 or div_open < div_close):
            # Found an opening <div
            # Check if it's self-closing
            end_of_tag = content.find('>', div_open)
            if end_of_tag != -1:
                tag_content = content[div_open:end_of_tag+1]
                if tag_content.endswith('/>'):
                    # print(f"Self-closing div at pos {div_open}")
                    pass
                else:
                    line_num = content.count('\n', 0, div_open) + 1
                    stack.append(('div', line_num))
            pos = div_open + 4
        else:
            # Found a closing </div>
            if not stack:
                line_num = content.count('\n', 0, div_close) + 1
                print(f"Extra closing </div> at line {line_num}")
            else:
                stack.pop()
            pos = div_close + 6
            
    for tag, line in stack:
        print(f"Unclosed <{tag}> from line {line}")

if __name__ == "__main__":
    check_tags(sys.argv[1])
