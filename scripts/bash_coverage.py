import sys
import os
import re
from collections import defaultdict

def parse_trace(trace_file):
    executed = defaultdict(set)
    # Match: + path/to/file.sh:line: ...
    # We use a non-greedy match for the filename to handle cases with multiple colons
    pattern = re.compile(r'^\++\s+(.*?):(\d+):')

    if not os.path.exists(trace_file):
        print(f"Trace file {trace_file} not found.")
        return executed

    with open(trace_file, 'r', errors='ignore') as f:
        for line in f:
            # Look for the pattern anywhere in the line because BATS might wrap it
            match = pattern.search(line)
            if match:
                filename = match.group(1).strip()
                try:
                    lineno = int(match.group(2))
                except ValueError:
                    continue

                # Normalize filename
                # If it contains spaces or other chars, it might be quoted
                filename = filename.strip("'\"")

                # We try to find the best match in our filesystem
                if os.path.exists(filename):
                    executed[os.path.abspath(filename)].add(lineno)
                else:
                    # Try relative to root
                    abs_path = os.path.abspath(filename)
                    executed[abs_path].add(lineno)

    return executed

def get_source_lines(filename):
    if not os.path.exists(filename):
        return None

    with open(filename, 'r') as f:
        lines = f.readlines()

    source_lines = set()
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Skip empty lines, comments, and certain keywords that don't represent executable code
        if not stripped or stripped.startswith('#'):
            continue
        # Skip lines that are just structural
        if stripped in ('{', '}', 'then', 'else', 'fi', 'done', 'esac', 'do', '(', ')', ';;'):
            continue
        # Skip function definitions
        if re.match(r'^[a-zA-Z0-9_-]+\(\)\s*\{', stripped):
            continue
        source_lines.add(i + 1)
    return source_lines

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 bash_coverage.py trace.log script1.sh script2.sh ...")
        sys.exit(1)

    trace_file = sys.argv[1]
    scripts = [os.path.abspath(s) for s in sys.argv[2:]]

    executed = parse_trace(trace_file)

    total_executable = 0
    total_covered = 0

    print(f"{'File':<40} {'Covered':<10} {'Total':<10} {'%':<10}")
    print("-" * 75)

    cwd = os.getcwd()

    for script_abs in scripts:
        script_rel = os.path.relpath(script_abs, cwd)

        executable_lines = get_source_lines(script_abs)
        if executable_lines is None:
            print(f"{script_rel:<40} Not found")
            continue

        covered_lines = executed.get(script_abs, set()) & executable_lines

        num_executable = len(executable_lines)
        num_covered = len(covered_lines)

        percentage = (num_covered / num_executable * 100) if num_executable > 0 else 100

        print(f"{script_rel:<40} {num_covered:<10} {num_executable:<10} {percentage:>6.2f}%")

        total_executable += num_executable
        total_covered += num_covered

        # Show uncovered lines for debugging
        uncovered = sorted(list(executable_lines - covered_lines))
        if uncovered:
            print(f"  Uncovered lines: {uncovered[:20]}{'...' if len(uncovered) > 20 else ''}")

    print("-" * 75)
    total_percentage = (total_covered / total_executable * 100) if total_executable > 0 else 100
    print(f"{'TOTAL':<40} {total_covered:<10} {total_executable:<10} {total_percentage:>6.2f}%")

    if total_percentage < 85:
        print(f"\nCoverage too low: {total_percentage:.2f}% < 85%")

if __name__ == "__main__":
    main()
