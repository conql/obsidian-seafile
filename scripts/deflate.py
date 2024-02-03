import argparse
import zlib
import os

def uncompress_file(input_path, output_path):
    # Read the compressed data from the input file
    with open(input_path, 'rb') as file:
        compressed_data = file.read()

    # Uncompress the data
    try:
        uncompressed_data = zlib.decompress(compressed_data)
    except zlib.error as e:
        print(f"Error decompressing file: {e}")
        return

    # Write the uncompressed data to the output file
    with open(output_path, 'wb') as file:
        file.write(uncompressed_data)
    print(f"File decompressed successfully to {output_path}")

def main():
    # Set up argument parser
    parser = argparse.ArgumentParser(description="Uncompress a zlib compressed file.")
    parser.add_argument("input_path", type=str, help="Path to the input file to be uncompressed.")
    parser.add_argument("output_path", type=str, nargs='?', help="Path to the output uncompressed file. Defaults to the same name as the input file but with a .json extension.")

    # Parse arguments
    args = parser.parse_args()

    # Determine the output file name
    if args.output_path is None:
        # If no output path is provided, use the input file name with a .json extension
        base_name = os.path.splitext(os.path.basename(args.input_path))[0]
        output_path = os.path.join(os.path.dirname(args.input_path), f"{base_name}.json")
    else:
        output_path = args.output_path

    # Uncompress the file
    uncompress_file(args.input_path, output_path)

if __name__ == "__main__":
    main()
