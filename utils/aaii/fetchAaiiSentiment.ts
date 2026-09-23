const AAII_SENTIMENT_URL =
  "https://www.aaii.com/files/surveys/sentiment.xls";

  export async function fetchAaiiSentimentFile(): Promise<ArrayBuffer> {
    const response = await fetch(AAII_SENTIMENT_URL, {
      headers: {
        Accept:
          "application/vnd.ms-excel, application/octet-stream, text/html, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
        Referer: "https://www.aaii.com/sentimentsurvey",
      },
    });
  
    if (!response.ok) {
      throw new Error(
        `AAII request failed: ${response.status} ${response.statusText}`,
      );
    }
  
    const contentType = response.headers.get("content-type");
  
    console.log("status:", response.status);
    console.log("content-type:", contentType);
  
    if (
      !contentType?.includes("spreadsheet") &&
      !contentType?.includes("excel") &&
      !contentType?.includes("octet-stream")
    ) {
      const text = await response.text();
  
      console.log("AAII response:", text.slice(0, 500));
  
      throw new Error(
        `AAII returned unexpected content-type: ${contentType}`,
      );
    }
  
    return response.arrayBuffer();
  }