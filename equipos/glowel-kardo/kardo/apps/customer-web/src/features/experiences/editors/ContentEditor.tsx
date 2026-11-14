import type {
  Asset,
  ExperienceContent,
  ExperienceType,
} from "@kardo/contracts";
import type { ContentOf, ValidationErrors } from "../content.js";
import {
  DocumentEditor,
  FormEditor,
  ImageEditor,
  LinksEditor,
  ProfileEditor,
  RedirectEditor,
} from "./BasicEditors.js";
import { CatalogEditor } from "./CatalogEditor.js";
import { MenuEditor } from "./MenuEditor.js";

export function ContentEditor({
  type,
  content,
  onChange,
  errors,
  assets,
  readOnly,
  onAssetUploaded,
}: {
  type: ExperienceType;
  content: ExperienceContent;
  onChange: (content: ExperienceContent) => void;
  errors: ValidationErrors;
  assets: readonly Asset[];
  readOnly: boolean;
  onAssetUploaded: (asset: Asset) => void;
}) {
  const shared = { errors, assets, readOnly, onChange, onAssetUploaded };
  return (() => {
    switch (type) {
      case "redirect":
        return (
          <RedirectEditor
            {...shared}
            content={content as ContentOf<"redirect">}
          />
        );
      case "links":
        return (
          <LinksEditor {...shared} content={content as ContentOf<"links">} />
        );
      case "profile":
        return (
          <ProfileEditor
            {...shared}
            content={content as ContentOf<"profile">}
          />
        );
      case "image":
        return (
          <ImageEditor {...shared} content={content as ContentOf<"image">} />
        );
      case "document":
        return (
          <DocumentEditor
            {...shared}
            content={content as ContentOf<"document">}
          />
        );
      case "menu":
        return (
          <MenuEditor {...shared} content={content as ContentOf<"menu">} />
        );
      case "catalog":
        return (
          <CatalogEditor
            {...shared}
            content={content as ContentOf<"catalog">}
          />
        );
      case "form":
        return (
          <FormEditor {...shared} content={content as ContentOf<"form">} />
        );
    }
  })();
}
