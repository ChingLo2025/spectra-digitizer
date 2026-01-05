export function toCsv(points: Array<{ X: number; Y: number }>): string {
  const lines: string[] = ["X,Y"];
  for (const p of points) {
    lines.push(`${p.X},${p.Y}`);
  }
  return lines.join("\n");
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}
