/**
 * GlassBackdrop
 *
 * Fundo semi-transparente cinza para efeito glassmorphism simplificado.
 * Usado como primeiro filho em modais, popovers, dropdowns e outros overlays.
 * Renderizado de forma absoluta com opacidade reduzida (0.3).
 */

export const GlassBackdrop = () => {
  return (
    <div 
      className="absolute inset-0 bg-gray-900 rounded-xl"
      style={{ 
        opacity: 0.3,
        pointerEvents: 'none',
        zIndex: -1
      }}
      aria-hidden="true"
    />
  );
};
