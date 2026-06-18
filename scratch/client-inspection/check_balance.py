
import sys

def check_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    stack = []
    for i, line in enumerate(lines):
        # Very simple tag finding
        line_num = i + 1
        pos = 0
        while True:
            # Find next tag start
            tag_start = line.find('<', pos)
            if tag_start == -1:
                break
            
            # Check if it's a div
            if line.startswith('<div', tag_start):
                # Check if it's self-closing
                tag_end = line.find('>', tag_start)
                if tag_end != -1:
                    if line[tag_end-1] == '/':
                        # print(f"Self-closing div at line {line_num}")
                        pass
                    else:
                        stack.append(('div', line_num))
                pos = tag_start + 4
            elif line.startswith('</div>', tag_start):
                if not stack:
                    print(f"Extra </div> at line {line_num}")
                else:
                    tag, start_line = stack.pop()
                pos = tag_start + 6
            elif line.startswith('<>', tag_start):
                stack.append(('fragment', line_num))
                pos = tag_start + 2
            elif line.startswith('</>', tag_start):
                if not stack:
                    print(f"Extra </> at line {line_num}")
                else:
                    tag, start_line = stack.pop()
                    if tag != 'fragment':
                        print(f"Mismatched </> at line {line_num}. Expected </{tag}> for <{tag}> from line {start_line}")
                pos = tag_start + 3
            else:
                pos = tag_start + 1
                
    for tag, line in stack:
        print(f"Unclosed <{tag}> from line {line}")

if __name__ == "__main__":
    check_balance(sys.argv[1])
