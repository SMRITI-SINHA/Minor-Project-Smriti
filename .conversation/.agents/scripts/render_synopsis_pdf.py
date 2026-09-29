import fitz
from pathlib import Path

pdf_path = Path("attached_assets/Synopsis_AI_Based_Optimization_of_VLSI_Circuits-smriti1_1790698226991.pdf")
output_dir = Path(".agents/outputs/synopsis_pdf")
output_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
print(f"pages={doc.page_count}")
print(f"metadata={doc.metadata}")

for index, page in enumerate(doc):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output_path = output_dir / f"page_{index + 1:02d}.png"
    pixmap.save(output_path)
    text = page.get_text("text").replace("\n", " ")
    print(f"page={index + 1} text_chars={len(text)} image={output_path}")