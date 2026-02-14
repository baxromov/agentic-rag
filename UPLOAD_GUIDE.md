# 📤 Document Upload Guide

## Overview

Upload documents to your RAG system to make them searchable via the chat interface. The system supports PDF, DOCX, TXT, and Markdown files.

## Supported File Formats

- ✅ **PDF** (.pdf)
- ✅ **Word Documents** (.docx)
- ✅ **Text Files** (.txt)
- ✅ **Markdown** (.md)

## Upload Methods

### 1️⃣ Using the Web Interface (Easiest!)

1. **Start the application**:
   ```bash
   docker-compose up
   ```

2. **Open the frontend**: http://localhost:5173

3. **Click the upload button** (↑ icon) in the top right corner

4. **Select your file** and click "Upload Document"

5. **Wait for confirmation** - you'll see "Successfully uploaded..." message

6. **Start chatting!** - Your document is now searchable

### 2️⃣ Using cURL (Command Line)

```bash
# Upload a PDF
curl -X POST http://localhost:8000/documents/upload \
  -F "file=@/path/to/document.pdf"

# Upload a Word document
curl -X POST http://localhost:8000/documents/upload \
  -F "file=@research_paper.docx"

# Upload multiple files
curl -X POST http://localhost:8000/documents/upload \
  -F "file=@document1.pdf"

curl -X POST http://localhost:8000/documents/upload \
  -F "file=@document2.pdf"
```

**Response:**
```json
{
  "document_id": "abc-123-def-456",
  "source": "document.pdf",
  "chunks_count": 15
}
```

### 3️⃣ Using Python

```python
import requests

# Upload a single file
url = "http://localhost:8000/documents/upload"

with open("document.pdf", "rb") as f:
    files = {"file": ("document.pdf", f, "application/pdf")}
    response = requests.post(url, files=files)

result = response.json()
print(f"Uploaded: {result['source']}")
print(f"Chunks created: {result['chunks_count']}")
print(f"Document ID: {result['document_id']}")
```

**Upload multiple files:**
```python
import os
import requests

def upload_document(file_path):
    url = "http://localhost:8000/documents/upload"

    with open(file_path, "rb") as f:
        filename = os.path.basename(file_path)
        files = {"file": (filename, f)}
        response = requests.post(url, files=files)

    if response.ok:
        result = response.json()
        print(f"✅ {result['source']}: {result['chunks_count']} chunks")
    else:
        print(f"❌ Failed: {file_path}")

# Upload all PDFs in a directory
documents = [
    "research_paper.pdf",
    "user_manual.pdf",
    "meeting_notes.docx"
]

for doc in documents:
    upload_document(doc)
```

### 4️⃣ Using Swagger UI

1. **Open Swagger**: http://localhost:8000/docs

2. **Find POST /documents/upload**

3. **Click "Try it out"**

4. **Click "Choose File"** and select your document

5. **Click "Execute"**

6. **View the response** with document_id and chunk count

### 5️⃣ Using Postman

1. Create a **POST** request to: `http://localhost:8000/documents/upload`

2. Go to **Body** tab

3. Select **form-data**

4. Add a key named `file` with type **File**

5. Click **Select Files** and choose your document

6. Click **Send**

## 📋 List Uploaded Documents

```bash
# Using cURL
curl http://localhost:8000/documents/

# Using Python
import requests
response = requests.get("http://localhost:8000/documents/")
documents = response.json()["documents"]
for doc in documents:
    print(f"- {doc['key']} ({doc['size']} bytes)")
```

## 🗑️ Delete a Document

```bash
# Using cURL
curl -X DELETE http://localhost:8000/documents/{document_id}

# Using Python
import requests
document_id = "abc-123-def-456"
response = requests.delete(f"http://localhost:8000/documents/{document_id}")
print(response.json())
```

## 🔍 How Document Processing Works

1. **Upload**: File is sent to `/documents/upload` endpoint

2. **Storage**: Original file is stored in MinIO (S3-compatible storage)

3. **Extraction**: Text is extracted from the document
   - PDF: Uses `unstructured` library
   - DOCX: Extracts text from Word format
   - TXT/MD: Direct text reading

4. **Chunking**: Document is split into smaller chunks
   - Default: ~500-1000 characters per chunk
   - Preserves context with overlap

5. **Embedding**: Each chunk is converted to a vector using the embedding model
   - Model: `jinaai/jina-embeddings-v3`
   - Dimension: 1024

6. **Indexing**: Vectors are stored in Qdrant with metadata
   - Includes: source, page_number, language
   - Enables hybrid search (dense + full-text)

7. **Ready**: Document is now searchable via chat!

## 💡 Best Practices

### File Naming
- Use descriptive names: `Q4_financial_report.pdf` ✅
- Avoid: `document1.pdf` ❌
- Include dates: `meeting_notes_2024-01-15.txt` ✅

### File Organization
Upload related documents together:
```bash
# Upload project documentation
curl -F "file=@architecture.pdf" http://localhost:8000/documents/upload
curl -F "file=@api_docs.md" http://localhost:8000/documents/upload
curl -F "file=@user_guide.docx" http://localhost:8000/documents/upload
```

### Chunking Strategy
- **Small files** (<5 pages): Upload as-is
- **Large files** (>50 pages): Consider splitting into sections
- **Multi-topic docs**: Split by topic for better retrieval

### Language Support
The system auto-detects language:
- English documents → English chunks
- Russian documents → Russian chunks
- Uzbek documents → Uzbek chunks
- Mixed → Language per chunk

## 🧪 Test Upload & Retrieval

1. **Upload a test document**:
```bash
echo "RAG stands for Retrieval Augmented Generation. It combines retrieval and generation." > test.txt

curl -X POST http://localhost:8000/documents/upload \
  -F "file=@test.txt"
```

2. **Open frontend**: http://localhost:5173

3. **Ask**: "What is RAG?"

4. **Verify**: Response should include info from your uploaded document

5. **Check sources**: Expand the sources section to see `test.txt` cited

## 📊 Upload Limits

- **Max file size**: 100MB (configurable)
- **Concurrent uploads**: 10 simultaneous
- **Supported formats**: PDF, DOCX, TXT, MD
- **Processing time**: ~2-10 seconds per document (depends on size)

## 🐛 Troubleshooting

### "Upload failed" Error
```bash
# Check backend is running
curl http://localhost:8000/health

# Check logs
docker-compose logs fastapi
```

### "Empty file" Error
- Ensure file is not 0 bytes
- Check file permissions
- Try a different file format

### "MinIO connection failed"
```bash
# Restart MinIO
docker-compose restart minio

# Check MinIO is healthy
docker-compose ps minio
```

### Uploaded but not searchable
- Wait a few seconds for indexing
- Check Qdrant has the vectors:
  ```bash
  curl http://localhost:6333/collections/documents
  ```

### Slow upload
- Large files take longer
- Check network connection
- Use local upload (not over network)

## 🚀 Bulk Upload Script

Save as `bulk_upload.py`:

```python
#!/usr/bin/env python3
import os
import sys
import requests
from pathlib import Path

def upload_directory(directory_path):
    """Upload all supported documents in a directory."""

    supported_extensions = {'.pdf', '.docx', '.txt', '.md'}
    url = "http://localhost:8000/documents/upload"

    directory = Path(directory_path)
    if not directory.is_dir():
        print(f"Error: {directory_path} is not a directory")
        return

    files = [f for f in directory.iterdir()
             if f.is_file() and f.suffix.lower() in supported_extensions]

    print(f"Found {len(files)} documents to upload")
    print("-" * 50)

    for i, file_path in enumerate(files, 1):
        try:
            with open(file_path, "rb") as f:
                files_dict = {"file": (file_path.name, f)}
                response = requests.post(url, files=files_dict)

            if response.ok:
                result = response.json()
                print(f"✅ [{i}/{len(files)}] {result['source']}: "
                      f"{result['chunks_count']} chunks")
            else:
                print(f"❌ [{i}/{len(files)}] Failed: {file_path.name}")
        except Exception as e:
            print(f"❌ [{i}/{len(files)}] Error: {file_path.name} - {e}")

    print("-" * 50)
    print(f"Upload complete! {len(files)} documents processed")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python bulk_upload.py <directory>")
        sys.exit(1)

    upload_directory(sys.argv[1])
```

**Usage:**
```bash
python bulk_upload.py /path/to/documents/
```

## 📚 Example Use Cases

### 1. Research Papers
```bash
curl -F "file=@machine_learning_survey.pdf" \
  http://localhost:8000/documents/upload
```
Ask: "What are the main challenges in machine learning?"

### 2. Company Documentation
```bash
curl -F "file=@employee_handbook.pdf" \
  http://localhost:8000/documents/upload
```
Ask: "What is the vacation policy?"

### 3. Code Documentation
```bash
curl -F "file=@api_reference.md" \
  http://localhost:8000/documents/upload
```
Ask: "How do I authenticate with the API?"

### 4. Meeting Notes
```bash
curl -F "file=@Q1_planning_meeting.txt" \
  http://localhost:8000/documents/upload
```
Ask: "What were the key decisions from the Q1 planning meeting?"

## 🎉 Summary

You can upload documents using:
1. **Web UI** (easiest) - Click upload button in frontend
2. **cURL** - Command line
3. **Python** - Scripting
4. **Swagger UI** - Interactive docs
5. **Postman** - API testing

All uploaded documents become instantly searchable via the chat interface!

**Start uploading and enhance your RAG system! 📤**
