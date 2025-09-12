import { configureStore, combineSlices } from "@reduxjs/toolkit";
import { messageSlice } from "./messages";
import { userSlice } from "./user";
import { useDispatch, useSelector } from "react-redux";

const rootReducer = combineSlices(messageSlice, userSlice);

export const store = configureStore({
  reducer: rootReducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
