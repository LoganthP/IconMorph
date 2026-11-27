//! The JSON the React UI sends must deserialize into the engine's types.
//! Mirrors `defaultSpec()` in src/lib/spec.ts and the SourceInput union in src/lib/types.ts.
use iconmorph_core::compose;
use iconmorph_core::{compose::*, ApplyRequest, SourceInput};

#[test]
fn ui_default_spec_round_trips() {
    let json = r##"{
      "mode": "fullReplacement",
      "folder": "classic",
      "fill": { "color": "#E8A68C", "color2": "#E3C1D6", "appearance": "gradient", "texture": "none" },
      "shape": { "kind": "squircle", "borderWidth": 0, "borderColor": "#FFFFFF", "cornerRadius": 0.22, "padding": 0.19 },
      "layer": { "scale": 0.85, "rotation": 0, "flipH": false, "flipV": false, "offsetX": 0, "offsetY": 0,
                 "opacity": 1, "pixelArt": false, "trim": true },
      "effects": { "shadow": true, "outlineWidth": 0, "outlineColor": "#FFFFFF", "sticker": false }
    }"##;
    let spec: IconSpec = serde_json::from_str(json).unwrap();
    assert_eq!(spec.mode, Mode::FullReplacement);
    assert_eq!(spec.shape.kind, ShapeKind::Squircle);
    // Same field names in both directions (numbers differ only by f32 formatting).
    let back = serde_json::to_value(&spec).unwrap();
    assert_eq!(
        key_paths(&back, ""),
        key_paths(&serde_json::from_str(json).unwrap(), "")
    );
    assert!((spec.layer.scale - 0.85).abs() < 1e-6);
}

fn key_paths(v: &serde_json::Value, prefix: &str) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(map) = v.as_object() {
        for (k, child) in map {
            let p = format!("{prefix}.{k}");
            out.push(p.clone());
            out.extend(key_paths(child, &p));
        }
    }
    out.sort();
    out
}

#[test]
fn v0_1_specs_from_existing_databases_still_load() {
    let old = r##"{"mode":"customShape","fill":{"color":"#A78BFA","color2":"#60A5FA","appearance":"glass"},
        "shape":{"kind":"hexagon","borderWidth":4,"borderColor":"#FFFFFF"},"layer":{"scale":0.5},"effects":{"shadow":false}}"##;
    let spec: IconSpec = serde_json::from_str(old).unwrap();
    assert_eq!(spec.folder, FolderStyle::Classic);
    assert_eq!(spec.fill.texture, Texture::None);
    assert!(
        (spec.shape.corner_radius - 0.22).abs() < 1e-6 && (spec.shape.padding - 0.19).abs() < 1e-6
    );
    assert!(compose(
        &spec,
        Some(&image::RgbaImage::from_pixel(
            8,
            8,
            image::Rgba([1, 2, 3, 255])
        ))
    )
    .is_ok());
}

#[test]
fn ui_source_inputs_deserialize() {
    for (json, ok) in [
        (r#"{"type":"none"}"#, true),
        (r#"{"type":"file","path":"/x.gif","gifFrame":2}"#, true),
        (r#"{"type":"file","path":"/x.png","gifFrame":null}"#, true),
        (r#"{"type":"bytes","base64":"AAAA"}"#, true),
        (r#"{"type":"url","href":"http://evil"}"#, false),
    ] {
        assert_eq!(
            serde_json::from_str::<SourceInput>(json).is_ok(),
            ok,
            "{json}"
        );
    }
    let req: ApplyRequest =
        serde_json::from_str(r#"{"target":"/t","spec":{"mode":"classicFolder"}}"#).unwrap();
    assert!(matches!(req.source, SourceInput::None));
}
