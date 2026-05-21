/* For now, mock the date-fns functions. When support for Node <26 is dropped, move to Temporal */

export const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const parseDate = (input: string): Date => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (!match) return new Date(NaN);
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
};
