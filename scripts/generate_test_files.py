import os
import shutil
import random
from faker import Faker

fake = Faker()

def create_random_name():
    """Generate a random name using Faker."""
    return fake.word()

def create_random_text(sentences=5):
    """Generate random text using Faker."""
    return fake.text(max_nb_chars=200)  # Generates a block of text

def create_files_in_directory(directory, num_files):
    """Create a specified number of files with random content in the given directory."""
    for _ in range(num_files):
        filename = create_random_name() + ".md"
        filepath = os.path.join(directory, filename)
        with open(filepath, 'w') as f:
            f.write(create_random_text())

def create_random_folders_and_files(start_path, max_depth, max_files, current_depth=1, max_folders_per_level=5):
    """Recursively create a random folder and file structure with content."""
    if current_depth > max_depth:
        return
    
    num_files = random.randint(0, max_files)
    create_files_in_directory(start_path, num_files)

    num_folders = random.randint(1, max_folders_per_level)
    for _ in range(num_folders):
        folder_name = create_random_name()
        folder_path = os.path.join(start_path, folder_name)
        os.makedirs(folder_path, exist_ok=True)
        
        # Recursively create more folders inside this one
        create_random_folders_and_files(folder_path, max_depth, max_files, current_depth + 1, max_folders_per_level)

if __name__ == "__main__":
    base_path = "test_directory"  # Base directory to start creating files and folders
    max_depth = 3  # Maximum depth of folders
    max_files = 10  # Maximum number of files to create in a folder
    max_folders_per_level = 3  # Maximum number of folders to create at each level

    # Delete the directory if it exists
    if os.path.exists(base_path):
        shutil.rmtree(base_path)

    # Ensure the base directory exists
    os.makedirs(base_path, exist_ok=True)

    # Start the process of creating folders and files
    create_random_folders_and_files(base_path, max_depth, max_files, 1, max_folders_per_level)

    print(f"Random folders and files with content created in '{base_path}'")
