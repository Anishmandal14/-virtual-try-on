import { GoogleGenAI, Modality } from "@google/genai";
import { marked } from "marked";

// --- DOM Element Selectors ---
const personUploadInput = document.getElementById('person-upload') as HTMLInputElement;
const outfitUploadInput = document.getElementById('outfit-upload') as HTMLInputElement;
const personDropZone = document.getElementById('person-drop-zone') as HTMLLabelElement;
const outfitDropZone = document.getElementById('outfit-drop-zone') as HTMLLabelElement;
const personPreview = document.getElementById('person-preview') as HTMLImageElement;
const outfitPreview = document.getElementById('outfit-preview') as HTMLImageElement;
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const resultsSection = document.getElementById('results-section') as HTMLElement;
const resultImage = document.getElementById('result-image') as HTMLImageElement;
const downloadButton = document.getElementById('download-button') as HTMLAnchorElement;
const loader = document.getElementById('loader') as HTMLElement;
const errorContainer = document.getElementById('error-container') as HTMLElement;

// --- State Management ---
let personFileData: { mimeType: string; data: string; } | null = null;
let outfitFileData: { mimeType: string; data: string; } | null = null;

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// --- Helper Functions ---
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
};

const updateGenerateButtonState = () => {
  generateButton.disabled = !(personFileData && outfitFileData);
};

const displayError = (message: string) => {
  errorContainer.textContent = message;
  errorContainer.style.display = 'block';
  loader.style.display = 'none';
};

// --- Event Handlers ---
const handleFileUpload = (file: File | null, type: 'person' | 'outfit') => {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const previewElement = type === 'person' ? personPreview : outfitPreview;
    const dropZoneElement = type === 'person' ? personDropZone : outfitDropZone;
    
    previewElement.src = e.target?.result as string;
    previewElement.classList.add('visible');
    dropZoneElement.classList.add('has-image');

    const part = await fileToGenerativePart(file);
    if (type === 'person') {
      personFileData = part.inlineData;
    } else {
      outfitFileData = part.inlineData;
    }
    updateGenerateButtonState();
  };
  reader.readAsDataURL(file);
};

personUploadInput.addEventListener('change', () => handleFileUpload(personUploadInput.files?.[0] ?? null, 'person'));
outfitUploadInput.addEventListener('change', () => handleFileUpload(outfitUploadInput.files?.[0] ?? null, 'outfit'));


// Drag and Drop functionality
const setupDragAndDrop = (dropZone: HTMLElement, input: HTMLInputElement, type: 'person' | 'outfit') => {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#8e44ad';
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#444';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#444';
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            input.files = files;
            handleFileUpload(files[0], type);
        }
    });
};

setupDragAndDrop(personDropZone, personUploadInput, 'person');
setupDragAndDrop(outfitDropZone, outfitUploadInput, 'outfit');


generateButton.addEventListener('click', async () => {
  if (!personFileData || !outfitFileData) {
    displayError('Please upload both a person and an outfit image.');
    return;
  }

  // Reset UI for new generation
  errorContainer.style.display = 'none';
  resultsSection.classList.add('visible');
  resultImage.style.display = 'none';
  downloadButton.style.display = 'none';
  loader.style.display = 'block';
  generateButton.disabled = true;

  try {
    const prompt = `
      You are an expert virtual stylist. Your task is to perform a realistic virtual try-on.
      1.  **Preserve Identity:** The person's face, hair, and skin tone from the first image must remain completely unchanged.
      2.  **Replace Clothing:** Replace the clothing on the person in the first image with the complete outfit from the second image.
      3.  **Realistic Fit & Shading:** The new outfit must fit the person's body realistically. Pay close attention to proportions, draping, and how the fabric would naturally fall. Add natural shadows and highlights to the new outfit to make it look like it's part of the scene's lighting.
      4.  **New Background:** Generate a new, suitable background that complements the style of the new outfit. For example, a formal dress might get a backdrop of an elegant event, while a casual outfit might get a city street scene.
      5.  **Output:** Return only the final, edited image. Do not return any text.
    `;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [
                { inlineData: personFileData },
                { inlineData: outfitFileData },
                { text: prompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    
    const imagePart = response.candidates?.[0]?.content?.parts.find(part => part.inlineData);

    if (imagePart && imagePart.inlineData) {
      const base64Image = imagePart.inlineData.data;
      const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${base64Image}`;
      resultImage.src = imageUrl;
      downloadButton.href = imageUrl;

      resultImage.style.display = 'block';
      downloadButton.style.display = 'inline-block';
    } else {
      const textPart = response.candidates?.[0]?.content?.parts.find(part => part.text);
      const errorMessage = textPart?.text || "Sorry, I couldn't generate an image. Please try again with different images.";
      displayError(errorMessage);
    }

  } catch (e) {
    console.error(e);
    displayError('An error occurred while generating the image. Please check the console for details.');
  } finally {
    loader.style.display = 'none';
    generateButton.disabled = false;
  }
});
