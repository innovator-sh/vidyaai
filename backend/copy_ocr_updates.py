import os
import shutil

src_dir = "OCR/vidyaai_rag"
dest_dir = "vidyaai_rag"

# Read the comp_out.txt to get the list of modified and new files
with open("comp_out.txt") as f:
    lines = f.readlines()

for line in lines:
    line = line.strip()
    if not line: continue
    
    file_path = None
    if line.startswith("Modified: "):
        file_path = line.split("Modified: ", 1)[1]
    elif line.startswith(f"Only in {src_dir}: "):
        file_path = os.path.join(src_dir, line.split(f"Only in {src_dir}: ", 1)[1])
        
    if file_path and os.path.isfile(file_path):
        # Calculate destination
        rel_path = os.path.relpath(file_path, src_dir)
        dest_path = os.path.join(dest_dir, rel_path)
        
        # Ensure dir exists
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        
        # Copy
        print(f"Copying {rel_path}")
        shutil.copy2(file_path, dest_path)
        
print("Bulk porting complete!")
