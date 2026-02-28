import os
import filecmp

with open('comp_out.txt', 'w') as f:
    def compare_dirs(dir1, dir2):
        dcmp = filecmp.dircmp(dir1, dir2)
        for name in dcmp.diff_files:
            f.write(f"Modified: {dir1}/{name}\n")
        for name in dcmp.left_only:
            f.write(f"Only in {dir1}: {name}\n")
        for subdir in dcmp.common_dirs:
            compare_dirs(os.path.join(dir1, subdir), os.path.join(dir2, subdir))
    compare_dirs("OCR/vidyaai_rag", "vidyaai_rag")
