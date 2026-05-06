#!/usr/bin/env python3
"""
Replace .opencode directory references with .deepseek-code across the codebase.
Strategy:
- ".opencode" as a directory path → ".deepseek-code"
- "opencode.json" / "opencode.jsonc" config files → "deepseek-code.json" / "deepseek-code.jsonc"
- Keep package names like "@opencode-ai/..." unchanged (those are npm packages)
- Keep URLs like "opencode.ai" unchanged
- Keep the "opencode" npm package name in package.json unchanged
"""
import os
import re

ROOT = "/home/mira/.session/deepseek-code"
SKIP_DIRS = {"node_modules", ".git", "bun.lock"}
EXTENSIONS = {".ts", ".json", ".jsonc", ".md", ".txt", ".yml", ".yaml"}

# Files that need .opencode → .deepseek-code replacement
replacements_done = 0
files_modified = 0

def should_process(filepath):
    # Skip node_modules, .git, bun.lock
    parts = filepath.split(os.sep)
    for skip in SKIP_DIRS:
        if skip in parts:
            return False
    ext = os.path.splitext(filepath)[1]
    return ext in EXTENSIONS

def replace_in_file(filepath):
    global replacements_done, files_modified
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except:
        return
    
    original = content
    
    # 1. Replace ".opencode" directory references (as path component)
    #    Match: ".opencode/" or ".opencode" at end, or ".opencode" followed by quote/comma/space
    #    But NOT: "@opencode-ai", "opencode.ai", "ai.opencode", "#opencode", "# opencode"
    
    # Direct path references: ".opencode" as directory name
    # Pattern: quote or path-sep followed by .opencode
    content = content.replace('".opencode"', '".deepseek-code"')
    content = content.replace("'.opencode'", "'.deepseek-code'")
    content = content.replace('`.opencode`', '`.deepseek-code`')
    content = content.replace('/.opencode/', '/.deepseek-code/')
    content = content.replace('/.opencode"', '/.deepseek-code"')
    content = content.replace("/.opencode'", "/.deepseek-code'")
    content = content.replace('/.opencode`', '/.deepseek-code`')
    content = content.replace('/.opencode,', '/.deepseek-code,')
    content = content.replace(', ".opencode"', ', ".deepseek-code"')
    
    # Config file names
    content = content.replace('"opencode.json"', '"deepseek-code.json"')
    content = content.replace('"opencode.jsonc"', '"deepseek-code.jsonc"')
    content = content.replace("'opencode.json'", "'deepseek-code.json'")
    content = content.replace("'opencode.jsonc'", "'deepseek-code.jsonc'")
    
    # Path joins and endsWith patterns
    content = content.replace('.endsWith(".opencode")', '.endsWith(".deepseek-code")')
    content = content.replace('.endsWith(".deepseek-code")', '.endsWith(".deepseek-code")')
    
    # Uninstall script references to .opencode/bin
    content = content.replace('.opencode/bin', '.deepseek-code/bin')
    content = content.replace('.opencode\\\\bin', '.deepseek-code\\\\bin')
    
    # targets: [".opencode"] in paths.ts
    content = content.replace('targets: [".opencode"]', 'targets: [".deepseek-code"]')
    
    # The managed plist domain
    content = content.replace('"ai.opencode.managed"', '"ai.deepseek-code.managed"')
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        count = sum(1 for a, b in zip(original, content) if a != b) // 2  # rough count
        files_modified += 1
        replacements_done += original.count('.opencode') - content.count('.opencode')
        return True
    return False

# Walk the tree
modified_files = []
for root, dirs, files in os.walk(ROOT):
    # Skip unwanted dirs
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for fname in files:
        filepath = os.path.join(root, fname)
        if should_process(filepath):
            if replace_in_file(filepath):
                rel = os.path.relpath(filepath, ROOT)
                modified_files.append(rel)

print(f"Files modified: {len(modified_files)}")
for f in sorted(modified_files):
    print(f"  {f}")
