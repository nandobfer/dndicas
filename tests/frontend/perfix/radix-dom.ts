/** O Radix Select usa APIs de ponteiro/rolagem que o DOM de teste não implementa. */
export function installRadixDomPolyfills() {
    const proto = Element.prototype as unknown as Record<string, unknown>
    proto.hasPointerCapture ??= () => false
    proto.setPointerCapture ??= () => undefined
    proto.releasePointerCapture ??= () => undefined
    proto.scrollIntoView ??= () => undefined
}
