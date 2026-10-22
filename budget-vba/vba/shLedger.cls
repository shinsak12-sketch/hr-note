Option Explicit

Private Sub Worksheet_Change(ByVal Target As Range)
    If Target.Row >= LED_FIRST Then MarkDirty
End Sub
