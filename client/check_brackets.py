
import sys

def check_brackets(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    brackets = {'(': ')', '{': '}', '[': ']'}
    lines = content.split('\n')
    
    in_comment = False
    in_string = None # None, ' or " or `
    
    for i, line in enumerate(lines):
        ln = i + 1
        j = 0
        while j < len(line):
            char = line[j]
            
            if in_comment:
                if char == '*' and j + 1 < len(line) and line[j+1] == '/':
                    in_comment = False
                    j += 1
            elif in_string:
                if char == in_string:
                    if j > 0 and line[j-1] == '\\':
                        pass # escaped
                    else:
                        in_string = None
                elif in_string == '`' and char == '$' and j + 1 < len(line) and line[j+1] == '{':
                    stack.append(('${', ln, j))
                    j += 1
            else:
                if char == '/' and j + 1 < len(line) and line[j+1] == '/':
                    break # line comment
                elif char == '/' and j + 1 < len(line) and line[j+1] == '*':
                    in_comment = True
                    j += 1
                elif char in ["'", '"', '`']:
                    in_string = char
                elif char in brackets.keys():
                    stack.append((char, ln, j))
                elif char in brackets.values():
                    if not stack:
                        print(f"Unmatched closing bracket '{char}' at line {ln}, col {j}")
                    else:
                        opening, open_ln, open_col = stack.pop()
                        if opening == '${' and char == '}':
                            pass
                        elif brackets.get(opening) != char:
                            print(f"Mismatched bracket '{char}' at line {ln}, col {j}. Expected '{brackets.get(opening)}' for '{opening}' from line {open_ln}")
            j += 1
            
    for opening, ln, col in stack:
        print(f"Unclosed bracket '{opening}' from line {ln}, col {col}")

if __name__ == "__main__":
    check_brackets(sys.argv[1])
