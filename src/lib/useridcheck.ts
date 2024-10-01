const SPECIAL_CASE_USERS = new Map<string, string>();

SPECIAL_CASE_USERS.set('lapisgamerfoxviewingartsonly', 'Lapis_gamer_fox__viewing_arts_');

export function assertUsernameToIDValid(id: string, name: string): void {
    if (SPECIAL_CASE_USERS.has(id) && SPECIAL_CASE_USERS.get(id) !== name) {
        throw new Error(
            `Special case user ID mismatch: "${id}" vs "${name}" (expected "${SPECIAL_CASE_USERS.get(id)}")`,
        );
    }

    const idFixLength = id.replaceAll('_', '').length;
    const nameFixLength = name.replaceAll('_', '').length;
    if (idFixLength !== nameFixLength) {
        throw new Error(`ID and Name fix length mismatch: "${id}" (${idFixLength}) vs "${name}" (${nameFixLength})`);
    }
}
