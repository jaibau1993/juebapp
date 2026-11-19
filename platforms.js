// Los filtros, el formulario y el orden del listado se generan desde esta lista.
// Conserva los valores existentes: se guardan en Firestore.
export const platformFamilies = {
  nintendo: {
    label: "Nintendo",
    consoles: ["GB", "GBC", "GBA", "DS/3DS", "Switch", "Switch 2"]
  },
  xbox: {
    label: "Xbox",
    consoles: ["XBOX 360", "XBOX One/X"]
  },
  playstation: {
    label: "PlayStation",
    consoles: ["PS2", "PS4", "PS5"]
  }
};

export const defaultPlatform = "PS5";
