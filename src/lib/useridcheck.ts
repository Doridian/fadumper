export function assertUsernameToIDValid(id: string, name: string): void {
    if (name.length >= 30) {
        return;
    }

    const idFixLength = id.replaceAll('_', '').length;
    const nameFixLength = name.replaceAll('_', '').length;
    if (idFixLength !== nameFixLength) {
        throw new Error(`ID and Name fix length mismatch: "${id}" (${idFixLength}) vs "${name}" (${nameFixLength})`);
    }
}
