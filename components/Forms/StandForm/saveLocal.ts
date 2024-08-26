import { CreateStandForm } from "@/models/StandForm";

export const STORAGE_KEY = "standForms";



const getData = () : CreateStandForm[] => { 
    const data = sessionStorage.getItem(STORAGE_KEY);

    return data ? JSON.parse(data) : [];
}

const saveData = (data: CreateStandForm[]) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const getSaveIndex = (matchNumber: number, teamNumber: number, data: CreateStandForm[] = getData()) => {
    return data.findIndex((f) => f.matchNumber == matchNumber && f.teamNumber == teamNumber);
}

export const getLocalSave = (matchNumber: number, teamNumber: number) => {
    const savedForms = getData();
    const index = getSaveIndex(matchNumber, teamNumber, savedForms);
    return index !== -1 ? savedForms[index] : null;
}

export const saveLocal = (data: CreateStandForm) => {
    const savedForms = getData();
    const saveIndex = getSaveIndex(data.matchNumber, data.teamNumber, savedForms);

    if (saveIndex !== -1) {
        savedForms[saveIndex] = data;
    } else {
        savedForms.push(data);
    }

    saveData(savedForms);
}

export const deleteLocalSave = (matchNumber: number, teamNumber: number) => {
    const savedForms = getData();
    const index = getSaveIndex(matchNumber, teamNumber, savedForms);

    savedForms.splice(index, 1);
    saveData(savedForms);
}

