export const isNotBlank = (val: any) => {
    return val !== null && val !== undefined && typeof val == 'string' && val.trim().length > 0;
}

export const isBlank = (val: any) => {
    return !val || (typeof val == 'string' && val.trim().length == 0);
}